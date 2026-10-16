ALTER TABLE booking ADD COLUMN leg_index INTEGER;

UPDATE booking SET leg_index = 0 WHERE group_ref IS NULL OR group_ref = '';

UPDATE booking
   SET leg_index = CASE
     WHEN rowid = (
       SELECT MIN(b2.rowid) FROM booking b2 WHERE b2.group_ref = booking.group_ref
     ) THEN 0
     ELSE 1
   END
 WHERE group_ref IS NOT NULL AND group_ref != '';
