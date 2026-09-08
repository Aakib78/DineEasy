import { IsObject } from 'class-validator';

/**
 * `payload` is an opaque, provider-independent print job description (spec §13) — a list of
 * ESC/POS-agnostic lines/sections (text, cut, header) that any print agent implementation can
 * render however its hardware needs. Nothing in DineEasy's core domain constructs raw ESC/POS
 * bytes — see docs/printing.md.
 */
export class EnqueuePrintJobDto {
  @IsObject()
  payload!: Record<string, unknown>;
}
