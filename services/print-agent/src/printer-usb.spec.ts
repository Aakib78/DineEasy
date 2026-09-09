/**
 * Unlike `printer-socket.spec.ts` (a real local TCP server stands in for a network printer)
 * there's no equivalent real stand-in for USB without actual hardware, which this environment
 * doesn't have — so this mocks the `usb` package itself, at the same narrow surface
 * `printer-usb.ts` actually calls (`getDeviceList`, a device's `open`/`close`/`interfaces`, an
 * interface's `claim`/`release`/`endpoints`, an endpoint's `transferAsync`). This still proves
 * the orchestration this file is actually responsible for — which device gets picked, that a
 * claimed interface and opened device are always released/closed even when something later
 * fails, that discovery moves on to the next device rather than giving up — which is exactly
 * the kind of logic `poll-loop.spec.ts` proves the same way (fully in-memory fakes) for its own
 * layer, since the lower-level pieces (a real TCP write, a real HTTP call) are what get proven
 * against real stand-ins instead.
 */
import { getDeviceList } from 'usb';
import { sendToUsbPrinter, UsbPrinterNotFoundError } from './printer-usb';

jest.mock('usb', () => ({
  getDeviceList: jest.fn(),
  usb: { LIBUSB_CLASS_PRINTER: 7 },
}));

const mockGetDeviceList = getDeviceList as jest.MockedFunction<typeof getDeviceList>;

function fakeEndpoint(direction: 'in' | 'out', overrides: Record<string, unknown> = {}) {
  return {
    direction,
    timeout: 0,
    transferAsync: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeInterface(
  opts: {
    bInterfaceClass?: number;
    endpoints?: ReturnType<typeof fakeEndpoint>[];
    claim?: () => void;
  } = {},
) {
  return {
    descriptor: { bInterfaceClass: opts.bInterfaceClass ?? 7 },
    endpoints: opts.endpoints ?? [fakeEndpoint('out')],
    claim: opts.claim ?? jest.fn(),
    release: jest.fn((_closeEndpoints: boolean, cb?: () => void) => cb?.()),
  };
}

function fakeDevice(
  opts: {
    idVendor?: number;
    idProduct?: number;
    interfaces?: ReturnType<typeof fakeInterface>[] | undefined;
    openThrows?: boolean;
  } = {},
) {
  return {
    deviceDescriptor: { idVendor: opts.idVendor ?? 0x04b8, idProduct: opts.idProduct ?? 0x0202 },
    interfaces: opts.interfaces === undefined ? [fakeInterface()] : opts.interfaces,
    open: jest.fn(() => {
      if (opts.openThrows) throw new Error('LIBUSB_ERROR_ACCESS');
    }),
    close: jest.fn(),
  };
}

describe('sendToUsbPrinter', () => {
  const ticket = Buffer.from('hello');

  it('throws UsbPrinterNotFoundError when nothing is connected', async () => {
    mockGetDeviceList.mockReturnValue([]);
    await expect(sendToUsbPrinter(ticket)).rejects.toBeInstanceOf(UsbPrinterNotFoundError);
  });

  it('finds the first USB Printer-class device, claims it, transfers, and cleans up', async () => {
    const iface = fakeInterface();
    const device = fakeDevice({ interfaces: [iface] });
    mockGetDeviceList.mockReturnValue([device] as unknown as ReturnType<typeof getDeviceList>);

    await sendToUsbPrinter(ticket);

    expect(device.open).toHaveBeenCalledTimes(1);
    expect(iface.claim).toHaveBeenCalledTimes(1);
    expect(iface.endpoints[0].transferAsync).toHaveBeenCalledWith(ticket);
    expect(iface.release).toHaveBeenCalledTimes(1);
    expect(device.close).toHaveBeenCalledTimes(1);
  });

  it('skips a device that fails to open and tries the next one', async () => {
    const badDevice = fakeDevice({ openThrows: true });
    const goodInterface = fakeInterface();
    const goodDevice = fakeDevice({ interfaces: [goodInterface] });
    mockGetDeviceList.mockReturnValue([badDevice, goodDevice] as unknown as ReturnType<
      typeof getDeviceList
    >);

    await sendToUsbPrinter(ticket);

    expect(goodInterface.endpoints[0].transferAsync).toHaveBeenCalledWith(ticket);
    // A device that never opened has nothing to close.
    expect(badDevice.close).not.toHaveBeenCalled();
  });

  it('skips a device with no USB Printer-class interface and tries the next one', async () => {
    const nonPrinterDevice = fakeDevice({ interfaces: [fakeInterface({ bInterfaceClass: 1 })] });
    const printerInterface = fakeInterface();
    const printerDevice = fakeDevice({ interfaces: [printerInterface] });
    mockGetDeviceList.mockReturnValue([nonPrinterDevice, printerDevice] as unknown as ReturnType<
      typeof getDeviceList
    >);

    await sendToUsbPrinter(ticket);

    expect(printerInterface.endpoints[0].transferAsync).toHaveBeenCalledWith(ticket);
    // Opened to inspect its interfaces, then closed since it wasn't the printer.
    expect(nonPrinterDevice.close).toHaveBeenCalledTimes(1);
  });

  it('only considers devices matching an explicit vendor/product ID when one is given', async () => {
    const wrongVendor = fakeDevice({ idVendor: 0x1234, idProduct: 0x5678 });
    const rightInterface = fakeInterface();
    const rightDevice = fakeDevice({
      idVendor: 0x04b8,
      idProduct: 0x0202,
      interfaces: [rightInterface],
    });
    mockGetDeviceList.mockReturnValue([wrongVendor, rightDevice] as unknown as ReturnType<
      typeof getDeviceList
    >);

    await sendToUsbPrinter(ticket, { match: { vendorId: 0x04b8, productId: 0x0202 } });

    expect(wrongVendor.open).not.toHaveBeenCalled();
    expect(rightInterface.endpoints[0].transferAsync).toHaveBeenCalledWith(ticket);
  });

  it('rejects with UsbPrinterNotFoundError naming the vendor/product when the match has no candidates', async () => {
    mockGetDeviceList.mockReturnValue([
      fakeDevice({ idVendor: 0x1234, idProduct: 0x5678 }),
    ] as unknown as ReturnType<typeof getDeviceList>);

    await expect(
      sendToUsbPrinter(ticket, { match: { vendorId: 0x04b8, productId: 0x0202 } }),
    ).rejects.toThrow(/0x04b8.*0x0202/);
  });

  it('throws when the printer interface has no OUT endpoint, but still releases and closes', async () => {
    const iface = fakeInterface({ endpoints: [fakeEndpoint('in')] });
    const device = fakeDevice({ interfaces: [iface] });
    mockGetDeviceList.mockReturnValue([device] as unknown as ReturnType<typeof getDeviceList>);

    await expect(sendToUsbPrinter(ticket)).rejects.toThrow(/no OUT endpoint/);

    expect(iface.release).toHaveBeenCalledTimes(1);
    expect(device.close).toHaveBeenCalledTimes(1);
  });

  it('propagates a transfer failure and still releases the interface and closes the device', async () => {
    const failingEndpoint = fakeEndpoint('out', {
      transferAsync: jest.fn().mockRejectedValue(new Error('LIBUSB_TRANSFER_STALL')),
    });
    const iface = fakeInterface({ endpoints: [failingEndpoint] });
    const device = fakeDevice({ interfaces: [iface] });
    mockGetDeviceList.mockReturnValue([device] as unknown as ReturnType<typeof getDeviceList>);

    await expect(sendToUsbPrinter(ticket)).rejects.toThrow('LIBUSB_TRANSFER_STALL');

    expect(iface.release).toHaveBeenCalledTimes(1);
    expect(device.close).toHaveBeenCalledTimes(1);
  });
});
