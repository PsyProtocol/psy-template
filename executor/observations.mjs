// Observational metrics only. Never use for transaction or proof inputs.
import {writeFileSync} from 'node:fs';
export function observationJson(value) {
 return JSON.stringify(value, (_key, item) => {
  if (typeof item === 'bigint') return item.toString();
  if (typeof item === 'number' && (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))) throw new TypeError('invalid observation number');
  if (item === undefined || ['function','symbol'].includes(typeof item)) throw new TypeError('invalid observation value');
  if (item && typeof item === 'object' && !Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new TypeError('invalid observation object');
  return item;
 });
}
export const saveObservation = (path, value) => writeFileSync(path, observationJson(value)+'\n', {flag:'wx'});
