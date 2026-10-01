-- Sample data only (fictional doctors at SAMPLE clinics). Gives every sample clinic 2-3 doctors with morning + evening sessions.
INSERT OR IGNORE INTO doctors (id, clinic_id, name, specialty, qualification, experience_years, fee, days, sessions) VALUES
 ('dr-shalini-hegde','motherhood-child-family','Dr. Shalini Hegde','Obstetrician & Gynaecologist','MBBS, DGO, DNB (Obs & Gyn)',11,650,'[1,2,3,4,5,6]','[{"start":"10:00","end":"13:00"},{"start":"17:30","end":"20:00"}]'),
 ('dr-farhan-sheikh','skinfirst-derma','Dr. Farhan Sheikh','Cosmetologist & Hair Specialist','MBBS, DDVL',6,600,'[1,2,3,4,5,6]','[{"start":"10:30","end":"13:30"},{"start":"17:30","end":"20:00"}]'),
 ('dr-nandini-prabhu','marathahalli-multispeciality','Dr. Nandini Prabhu','Diabetologist','MBBS, MD, Fellowship (Diabetology)',13,500,'[1,2,3,4,5,6]','[{"start":"10:30","end":"13:00"},{"start":"17:00","end":"19:30"}]');
UPDATE doctors SET sessions='[{"start":"09:30","end":"13:00"},{"start":"17:00","end":"20:00"}]' WHERE id='dr-rohan-kulkarni';
UPDATE doctors SET days='[1,2,3,4,5,6]', sessions='[{"start":"11:00","end":"14:00"},{"start":"17:30","end":"20:00"}]' WHERE id='dr-meera-iyer';
