ALTER TABLE clinics ADD COLUMN cover_video TEXT;
UPDATE clinics SET cover_video='brand/ortho-cover.mp4' WHERE id='orthoplus-bone-joint';
