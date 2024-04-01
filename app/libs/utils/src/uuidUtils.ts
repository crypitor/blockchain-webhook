import ShortUniqueId from 'short-unique-id';
import { v4 as uuid } from 'uuid';
const shortId = new ShortUniqueId({ length: 10 });

export const generateUUID = () => {
  return uuid();
};

export const shortUUID = (length?: number) => {
  return shortId.rnd(length);
};
