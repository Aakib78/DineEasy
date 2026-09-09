import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import type { MenuItem } from '../../lib/api/types';
import type { CartLine } from '../../lib/cart/cart-types';
import { generateId } from '../../lib/id';
import { formatMoney } from '../../lib/cart/price-estimate';

interface Props {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}

/** Modal for picking a variant, modifiers, quantity and notes before adding an item to the
 *  cart. Enforces each modifier group's min/max select client-side for a good experience —
 *  the server independently validates the same rules at order-placement time regardless (see
 *  OrdersService.priceItems on the backend), so this is UX polish, not the source of truth. */
export function ItemCustomizeSheet({ item, onClose, onAdd }: Props) {
  const defaultVariant = item.variants.find((v) => v.isDefault) ?? item.variants[0];
  const [variantId, setVariantId] = useState<string | undefined>(defaultVariant?.id);
  const [selectedModifierIds, setSelectedModifierIds] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const unitPrice = useMemo(() => {
    if (variantId) {
      const variant = item.variants.find((v) => v.id === variantId);
      if (variant) return variant.priceOverride;
    }
    return item.basePrice;
  }, [item, variantId]);

  const allModifiers = useMemo(
    () => item.modifierGroups.flatMap((link) => link.modifierGroup.modifiers.map((m) => ({ ...m, groupId: link.modifierGroup.id }))),
    [item],
  );

  function toggleModifier(groupId: string, modifierId: string, maxSelect: number) {
    setSelectedModifierIds((prev) => {
      const next = new Set(prev);
      const groupModifierIds = new Set(
        item.modifierGroups
          .find((l) => l.modifierGroup.id === groupId)
          ?.modifierGroup.modifiers.map((m) => m.id) ?? [],
      );
      const selectedInGroup = [...next].filter((id) => groupModifierIds.has(id));

      if (next.has(modifierId)) {
        next.delete(modifierId);
        return next;
      }

      if (maxSelect === 1) {
        // Single-select group: picking a new option replaces whichever one was picked before.
        selectedInGroup.forEach((id) => next.delete(id));
        next.add(modifierId);
        return next;
      }

      if (selectedInGroup.length >= maxSelect) {
        return prev; // at the cap — ignore, the checkbox stays visually unchanged
      }
      next.add(modifierId);
      return next;
    });
  }

  const missingRequiredGroup = item.modifierGroups.find((link) => {
    if (!link.modifierGroup.isRequired && link.modifierGroup.minSelect === 0) return false;
    const groupModifierIds = new Set(link.modifierGroup.modifiers.map((m) => m.id));
    const selectedCount = [...selectedModifierIds].filter((id) => groupModifierIds.has(id)).length;
    return selectedCount < Math.max(link.modifierGroup.minSelect, link.modifierGroup.isRequired ? 1 : 0);
  });

  function handleAdd() {
    if (missingRequiredGroup) return;

    const modifierSummaries = allModifiers
      .filter((m) => selectedModifierIds.has(m.id))
      .map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta }));

    onAdd({
      // Not crypto.randomUUID() directly — see lib/id.ts's doc comment for why that silently
      // breaks "Add to cart" over plain HTTP on a LAN, which is how this app is always served.
      lineId: generateId(),
      menuItemId: item.id,
      menuItemName: item.name,
      variantId,
      variantName: item.variants.find((v) => v.id === variantId)?.name,
      unitPrice,
      quantity,
      notes: notes.trim() || undefined,
      modifierIds: [...selectedModifierIds],
      modifierSummaries,
    });
    onClose();
  }

  const estimatedTotal = new Decimal(unitPrice)
    .plus(
      allModifiers
        .filter((m) => selectedModifierIds.has(m.id))
        .reduce((sum, m) => sum.plus(m.priceDelta), new Decimal(0)),
    )
    .times(quantity);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__header">
          <h2>{item.name}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {item.description && <p className="sheet__description">{item.description}</p>}

        {item.variants.length > 0 && (
          <fieldset className="option-group">
            <legend>Choose one</legend>
            {item.variants.map((variant) => (
              <label key={variant.id} className="option-row">
                <input
                  type="radio"
                  name="variant"
                  checked={variantId === variant.id}
                  onChange={() => setVariantId(variant.id)}
                />
                <span>{variant.name}</span>
                <span className="option-row__price">{formatMoney(variant.priceOverride)}</span>
              </label>
            ))}
          </fieldset>
        )}

        {item.modifierGroups.map((link) => (
          <fieldset className="option-group" key={link.modifierGroup.id}>
            <legend>
              {link.modifierGroup.name}
              {(link.modifierGroup.isRequired || link.modifierGroup.minSelect > 0) && (
                <span className="required-badge">Required</span>
              )}
            </legend>
            {link.modifierGroup.modifiers.map((modifier) => (
              <label key={modifier.id} className="option-row">
                <input
                  type={link.modifierGroup.maxSelect === 1 ? 'radio' : 'checkbox'}
                  name={link.modifierGroup.id}
                  checked={selectedModifierIds.has(modifier.id)}
                  onChange={() =>
                    toggleModifier(link.modifierGroup.id, modifier.id, link.modifierGroup.maxSelect)
                  }
                />
                <span>{modifier.name}</span>
                {new Decimal(modifier.priceDelta).greaterThan(0) && (
                  <span className="option-row__price">+{formatMoney(modifier.priceDelta)}</span>
                )}
              </label>
            ))}
          </fieldset>
        ))}

        <label className="notes-field">
          Special instructions (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. less spicy, no onions"
            rows={2}
          />
        </label>

        <div className="quantity-row">
          <button
            className="icon-button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span>{quantity}</span>
          <button
            className="icon-button"
            onClick={() => setQuantity((q) => q + 1)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <button className="primary-button" onClick={handleAdd} disabled={!!missingRequiredGroup}>
          Add {quantity} to cart — {formatMoney(estimatedTotal)}
        </button>
      </div>
    </div>
  );
}
