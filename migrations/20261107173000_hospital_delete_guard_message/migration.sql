-- Prisma rewrites SQLSTATE 23503 into P2003 "Foreign key constraint violated: (not available)" and drops the
-- message, so the refusal could not be named. P0001 (raise_exception) keeps the rule name in the message.
CREATE OR REPLACE FUNCTION "hospital_refuse_delete_in_use"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'Room' AND EXISTS (SELECT 1 FROM "Bed" WHERE "room" = OLD."id") THEN
    RAISE EXCEPTION 'Room_delete_in_use: room still has beds' USING ERRCODE = 'P0001';
  ELSIF TG_TABLE_NAME = 'Ward' AND EXISTS (SELECT 1 FROM "Room" WHERE "ward" = OLD."id") THEN
    RAISE EXCEPTION 'Ward_delete_in_use: ward still has rooms' USING ERRCODE = 'P0001';
  ELSIF TG_TABLE_NAME = 'Department' AND (
    EXISTS (SELECT 1 FROM "Ward" WHERE "department" = OLD."id")
    OR EXISTS (SELECT 1 FROM "Encounter" WHERE "department" = OLD."id")
    OR EXISTS (SELECT 1 FROM "Clinician" WHERE "department" = OLD."id")
  ) THEN
    RAISE EXCEPTION 'Department_delete_in_use: department still has wards, clinicians or encounters' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
