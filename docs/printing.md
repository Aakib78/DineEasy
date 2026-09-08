# Printing

## Why printing is a queue, not a direct call

Restaurant printers (kitchen dot-matrix/thermal, receipt thermal) are flaky, sometimes offline, sometimes out of paper — and a KOT/bill must never be *lost* just because a printer hiccuped at the wrong moment (spec §43: "printer unavailable" is an explicit failure case to handle gracefully). So `KitchenModule`/`BillingModule` never talk to a printer directly; they enqueue a `PrinterJob` (`payload` is a structured, printer-agnostic description of what to print — order/table/items for a KOT, or the full invoice for a receipt) and move on. A separate print-agent concern drains the queue.

```
KOT/Invoice created
        │
        ▼
  PrinterJob (status: QUEUED)
        │
        ▼
  Print agent picks it up
        │
   ┌────┴────┐
   ▼         ▼
 SENT      FAILED (retry with backoff, surface to Settings → Printers after N attempts)
   │
   ▼
 ACKED (if the printer protocol supports delivery confirmation; otherwise SENT is terminal)
```

## v1 scope

`Printer` models a station-scoped (kitchen) or outlet-scoped (receipt) printer with `connectionType: NETWORK | USB` and, for network printers, `ipAddress`/`port`. The v1 print agent targets **network (Ethernet/Wi-Fi) ESC/POS thermal printers** — the dominant type in Indian QSRs/cafés — sending raw ESC/POS byte sequences over a raw TCP socket to the printer's port (typically 9100), run as part of the API process so it has direct LAN access without another moving part to deploy. USB printers are modeled in the schema (`connectionType: USB`) for forward-compatibility but v1's print agent does not implement a USB driver — see `docs/architecture.md` §15 for current build status.

## Why this stays out of the domain layer

`KitchenService.createKot()` and `BillingService.issueInvoice()` have zero knowledge of ESC/POS, printer IPs, or retry logic — they only know how to enqueue a `PrinterJob`. This means: a restaurant with no printers configured yet still gets working KOT/billing (the queue just accumulates unconsumed jobs, harmlessly); adding USB support, a cloud print service, or a different receipt format later touches only the print-agent code, never order/billing/kitchen logic; and a printer being offline for an hour never blocks taking new orders.

## Operator visibility

Settings → Printers shows each printer's last successful job, current queue depth, and recent failures — this is the "printer status" the system health screen surfaces (spec §59/§60).
