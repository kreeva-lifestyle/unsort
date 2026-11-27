-- amend_po: a change of "Fabric is for" is logged under its own kind.
--
-- WHY: 20261127150000 logged it as { kind: 'item', field: 'component' }. The
-- app that was live before that day prints every 'item' change into the
-- WhatsApp text for the vendor ("… → DUPATTA") and offers "Rev N — tell the
-- vendor" for it, and the owner's rule is that what a fabric is for never
-- reaches a vendor. A phone can show that older app for a minute after the
-- update goes out. Under a kind of its own ('component') the older app leaves
-- the change out of the vendor's text (it ignores kinds it does not know) and
-- the new app shows it in our own history only. No revision has been saved
-- with the first shape (the app that sends the component is not live yet).
do $do$
declare
  fn constant text := 'public.amend_po(uuid,jsonb,jsonb,text)';
  find constant text := $o$jsonb_build_object('kind', 'item', 'field', 'component', 'item_id', v_id, 'label', v_new_label, 'from', v_line.component, 'to', v_comp)$o$;
  put constant text := $n$jsonb_build_object('kind', 'component', 'item_id', v_id, 'label', v_new_label, 'from', v_line.component, 'to', v_comp)$n$;
  def text := pg_get_functiondef(fn::regprocedure);
begin
  if (length(def) - length(replace(def, find, ''))) / length(find) <> 1 then
    raise exception '% does not contain the component change entry exactly once — not patched', fn;
  end if;
  execute replace(def, find, put);
end $do$;
