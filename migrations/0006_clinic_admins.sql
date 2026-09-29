CREATE TABLE IF NOT EXISTS clinic_admins (
  clinic_id TEXT PRIMARY KEY REFERENCES clinics(id),
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

INSERT OR REPLACE INTO clinic_admins (clinic_id, email, salt, password_hash) VALUES
('marathahalli-multispeciality', 'marathahalli@demo.drayvenn.in', '552118da834bda6a75d7491b7d4c7fae', '3d85affafcfabfc917d7223ec53b4b7bfd2e75d1b56f884214a0f7abb5874acf'),
('smilecare-dental', 'smilecare@demo.drayvenn.in', 'c7307dafaa26efeadd8b61777051bbbd', '577a8eea12c9906d43b9638f0a72e8939adc405a84db16a958987fc527075b95'),
('motherhood-child-family', 'motherhood@demo.drayvenn.in', 'ac5cbabf86973ea51826e98de80717c6', '0582a4218927093701a777f913648b95801bd4ece91cffa61d1f66f0d6554404'),
('skinfirst-derma', 'skinfirst@demo.drayvenn.in', 'e6c540f61651beecd849631d012215b0', '49ba550e1b6b47b9fb0d1de235a40f18775992d2bf7d72c3f776ced668ceead9'),
('orthoplus-bone-joint', 'orthoplus@demo.drayvenn.in', 'e4559261d48101451863e52d190218dd', '450663d76d5b088a2fe3c3f5a20e580fade37e4850ffa9cc76c72c2798e07333');
