// "Same thing": file a word as "also known as" of an existing value (any
// attribute) — value_save on THAT value with the word added to its aliases.
import { useCallback } from 'react';
import type { TagsApi } from '../../data/tags';
import type { PbAttribute, PbLookAlike } from '../../tagTypes';

export function useAliasInto(attrs: PbAttribute[], api: TagsApi) {
  return useCallback(async (m: PbLookAlike, word: string) => {
    const v = attrs.find(a => a.id === m.attribute_id)?.values.find(x => x.id === m.value_id);
    if (!v) throw new Error('That value no longer exists — reload the page.');
    await api.saveValue({ attribute_id: v.attribute_id, id: v.id, name: v.name, aliases: [...v.aliases, word] });
  }, [attrs, api]);
}
