/**
 * lib/guest.ts — guest mode's data lifecycle.
 *
 * `ensureGuestData` seeds the guest account (parent + Amy and Bob) and
 * layers their assigned homework — the final week's packet for each
 * kid's grade — onto it. Sheets and keys are insert-if-absent, so an
 * existing guest account keeps everything it has scanned.
 */

import { GUEST_PACKET_KEYS, GUEST_PACKET_SHEETS } from "./book-guest-packets";
import { ensureSeeded, seedRecords } from "./store";

export function ensureGuestData(): void {
  ensureSeeded();
  seedRecords({ sheets: GUEST_PACKET_SHEETS, answerKeys: GUEST_PACKET_KEYS });
}
