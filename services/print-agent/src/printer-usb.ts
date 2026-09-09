import { getDeviceList, usb, Device, Interface, OutEndpoint } from 'usb';

export interface UsbPrinterMatch {
  vendorId: number;
  productId: number;
}

export interface SendToUsbPrinterOptions {
  /** Narrows which USB device to use when more than one is connected — matched against the
   * device's reported vendor/product ID. Omitted (the common case this v1 targets — one
   * counter machine, one receipt printer) means "the first connected device that identifies
   * itself as a USB Printer-class device," which is enough for a single-printer setup and
   * avoids requiring the `Printer` row to carry USB-specific fields the schema doesn't have
   * yet (see `docs/printing.md`'s USB section). */
  match?: UsbPrinterMatch;
  /** Default 5s — same reasoning as `SendToPrinterOptions.timeoutMs` in `printer-socket.ts`. */
  timeoutMs?: number;
}

export class UsbPrinterNotFoundError extends Error {
  constructor(match?: UsbPrinterMatch) {
    super(
      match
        ? `No USB device found matching vendor ${hex(match.vendorId)} / product ${hex(match.productId)}`
        : 'No USB printer found — check it is connected, powered on, and its cable is seated. ' +
            'On macOS, a printer already claimed by a CUPS/AirPrint driver may not be visible to ' +
            "a second process (see services/print-agent/README.md's USB section).",
    );
    this.name = 'UsbPrinterNotFoundError';
  }
}

/**
 * The USB-transport equivalent of `printer-socket.ts`'s `sendToPrinter`, for a printer
 * registered with `connectionType: 'USB'` (see `poll-loop.ts`'s `isPollable`). The ESC/POS
 * bytes themselves (`escpos.ts`) are identical either way — only *how they reach the printer*
 * differs: a raw TCP write to port 9100 for a network printer, versus a bulk transfer to a
 * claimed USB endpoint here.
 *
 * v1 scope, matching `PrintersScreen`'s doc comment: no per-device pinning is required.
 * Discovery finds the first USB device that exposes a USB Printer-class (0x07) interface —
 * standard, vendor-independent (Epson included) — which is enough for the common single
 * receipt-printer-per-machine setup. `options.match` exists for the day a machine has more
 * than one USB printer and needs to pick a specific one by vendor/product ID.
 *
 * Deliberately re-discovers and re-opens the device on every call rather than keeping a
 * persistent handle across poll cycles — a USB thermal printer is routinely unplugged,
 * power-cycled, or swapped by staff, and `usb` has no built-in reconnection handling to hook
 * into here; re-enumerating each send is the same "always start from a known-good state"
 * approach `printer-socket.ts` takes by opening a fresh TCP connection per ticket.
 */
export async function sendToUsbPrinter(
  ticket: Buffer,
  options: SendToUsbPrinterOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const candidates = getDeviceList().filter(
    (device) =>
      !options.match ||
      (device.deviceDescriptor.idVendor === options.match.vendorId &&
        device.deviceDescriptor.idProduct === options.match.productId),
  );

  for (const device of candidates) {
    if (await trySend(device, ticket, timeoutMs)) return;
  }

  throw new UsbPrinterNotFoundError(options.match);
}

/** Returns `false` (rather than throwing) only for "this device isn't the printer" — no USB
 * Printer-class interface, or it couldn't even be opened — so unfiltered discovery can move on
 * to the next connected device. Any failure *after* the printer interface is found and claimed
 * (a failed transfer, a timeout) is a real error and is thrown, since at that point this is
 * unambiguously the printer and the caller (`poll-loop.ts`) needs to report the job FAILED. */
async function trySend(device: Device, ticket: Buffer, timeoutMs: number): Promise<boolean> {
  let opened = false;
  let claimed: Interface | undefined;

  try {
    device.open();
    opened = true;
  } catch {
    return false; // not openable (permissions, claimed by another driver) — not our printer
  }

  try {
    const iface = (device.interfaces ?? []).find(
      (i) => i.descriptor.bInterfaceClass === usb.LIBUSB_CLASS_PRINTER,
    );
    if (!iface) return false;

    iface.claim();
    claimed = iface;

    const outEndpoint = iface.endpoints.find((ep): ep is OutEndpoint => ep.direction === 'out');
    if (!outEndpoint) {
      throw new Error('USB printer interface has no OUT endpoint to write to');
    }

    outEndpoint.timeout = timeoutMs;
    await outEndpoint.transferAsync(ticket);
    return true;
  } finally {
    try {
      claimed?.release(true, () => {});
    } catch {
      // best-effort — the device may have been unplugged mid-print
    }
    if (opened) {
      try {
        device.close();
      } catch {
        // same — nothing more to do if it's already gone
      }
    }
  }
}

function hex(n: number): string {
  return '0x' + n.toString(16).padStart(4, '0');
}
