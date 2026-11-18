// Settings → "Tags" tile: the owner's tag lists AND the category list live on
// the Tags page (categories moved there from this page, 2026-11-10); this tile
// opens it. New words on products are filed by themselves (owner, 2026-11-17),
// so there is nothing waiting to count here.
import { PbButton, PbSection, PbTile } from '../ui';

export default function TagsTile({ onOpen }: { onOpen: () => void }) {
  return (
    <PbTile as="section" aria-labelledby="pbs-tags">
      <PbSection title="Tags" id="pbs-tags"
        hint="Categories, and the attributes and values Playbook tags products with (Colour: Black, Work: Embroidery…). A product needs a value for each must-have attribute of its category before it goes to websites; the AI chooses missing ones by itself, and an “only if it fits” one (Product Type) only when a value truly fits. Websites send the values with {tags}. A new word Playbook meets on a product is filed by itself: as another name of the nearest value you have, or left out."
        right={<PbButton icon="tag" onClick={onOpen}>Categories &amp; tags</PbButton>} />
    </PbTile>
  );
}
