-- Client Finder ranks results by how big the hosted image is: a site carrying a
-- 3000px original is a materially different lead from one showing a thumbnail.
--
-- WHY these are stored rather than computed on read: Google Vision returns
-- neither dimensions nor byte size, so each one costs a ranged GET against the
-- hosting site. Paying that again on every read of a cached search would be
-- both slow and rude to the hosts.
--
-- WHY every one of them is NULLable: measurement legitimately fails. Hotlink
-- protection, a missing Content-Length, a dead CDN, an unsupported format —
-- all normal. NULL means "not measured", and the UI must say "size unknown"
-- rather than imply the image is small. A zero here would be a lie.
alter table client_finder_hits
  add column if not exists image_url text,
  add column if not exists width     int,
  add column if not exists height    int,
  add column if not exists bytes     bigint;

-- Guard against a parser bug writing nonsense: real images are positive and
-- well under 100k pixels a side.
alter table client_finder_hits
  drop constraint if exists cfh_sane_dimensions;
alter table client_finder_hits
  add constraint cfh_sane_dimensions check (
    (width  is null or (width  > 0 and width  <= 100000)) and
    (height is null or (height > 0 and height <= 100000)) and
    (bytes  is null or  bytes  >= 0)
  );

comment on column client_finder_hits.image_url is
  'The matching IMAGE on that page (url stays the page itself). Source for the size measurement.';
comment on column client_finder_hits.width is
  'Pixel width, or NULL when the host refused measurement. NULL is not zero.';
comment on column client_finder_hits.height is
  'Pixel height, or NULL when the host refused measurement. NULL is not zero.';
comment on column client_finder_hits.bytes is
  'File size in bytes from Content-Range/Content-Length, or NULL when unmeasurable.';
