# Penawaran Produk — Mizan

**Financing Origination System (FOS) untuk PT BPRS Hijra Alami**

*Draft Penawaran · Juni 2026*

---

## 1. Ringkasan Eksekutif

Mizan (مِيزان — "timbangan") adalah sistem origination pembiayaan yang dirancang untuk mempercepat dan merapikan proses pengajuan pembiayaan di Hijra Bank, dari intake hingga pencairan — termasuk siklus review dan adendum fasilitas setelahnya. Mizan menawarkan dua nilai utama:

1. **Visibilitas pipeline real-time** — semua pihak yang berwenang (RM, Legal, Risk, Komite, manajemen) dapat memantau posisi setiap aplikasi pembiayaan tanpa perlu bertanya via WhatsApp/email.
2. **AI tools untuk drafting** — beban administratif penyusunan dokumen analisis (MUAP, RSK) dipangkas oleh AI, sementara keputusan tetap sepenuhnya di tangan manusia.

Mizan **bukan pengganti Google Drive atau Google Docs** — tim tetap bekerja di tools yang sudah familiar. Mizan hadir sebagai *layer* di atasnya: mencatat, menimbang, dan mengingat seluruh proses, tanpa mengubah cara tim berkolaborasi.

**Filosofi desain:** Mizan menimbang dan mengingat, tidak menyetir. Keputusan final (DSR, LTV, kolektibilitas, persetujuan) mutlak di tangan RM, Risk, dan Komite. AI hanya mengambil alih beban rutinitas administratif.

---

## 2. Masalah yang Diselesaikan

Proses pembiayaan saat ini: analis menarik data dari berbagai sumber secara manual, menyusun MUAP di dokumen Word/GDocs dari nol, dokumen beredar via email, Komite memutuskan di atas kertas, dan jejak keputusan tersebar di inbox masing-masing. Hasilnya: proses lambat, status aplikasi sulit dilacak, dan jejak audit tidak utuh.

Mizan menyatukan semuanya dalam satu tempat: aplikasi pembiayaan hidup di satu pipeline, analisis dibantu AI, keputusan Komite tercatat dengan MoM yang ditandatangani digital, dan setiap aksi terekam otomatis.

| Aspek | Sebelumnya | Dengan Mizan |
|---|---|---|
| Status aplikasi | Cek manual via WhatsApp/email | Pipeline real-time, semua pihak berwenang dapat memantau |
| Drafting MUAP/RSK | Isi semua field manual dari nol | Field otomatis terisi dari sistem + AI draft narasi awal |
| Rantai persetujuan | Print, tanda tangan basah, scan ulang | Maker-checker digital dengan QR sign/verify |
| Jejak audit | Tersebar di inbox & dokumen | Append-only audit trail, tidak ada yang bisa dihapus |

---

## 3. Fitur yang Tersedia Saat Ini

### 3.1 Pipeline & Workflow

- **Pipeline 5 segmen yang dikoordinasikan RM** (Inisiasi → Risk Review → Komite → SP3 → Pencairan), dapat dilihat oleh semua divisi yang login. Pekerjaan awal (intake, kelengkapan dokumen, legal/appraisal, penyusunan MUAP) berjalan paralel dan fleksibel di segmen Inisiasi; gerbang kelengkapan (dokumen wajib, verifikasi NIK, AML) ditegakkan otomatis oleh sistem sebelum aplikasi dapat masuk ke Risk Review — kepatuhan terjaga tanpa menghambat kecepatan kerja RM.
- **Berkas nasabah sebagai pintu masuk** — nasabah (perorangan/badan usaha) adalah entitas utama: pengajuan baru dibuat dari berkas nasabah, riwayat pengajuan sebelumnya terbawa otomatis, dan sistem memberi peringatan dini duplikasi (NIK/NPWP) saat input.
- **Personal board per user** — daftar "yang harus dikerjakan hari ini" terpisah dari view pipeline keseluruhan, sehingga tiap orang fokus pada tugasnya.
- **Rantai persetujuan maker-checker** sesuai struktur organisasi: MUAP (Relationship Manager → Team Leader), RSK (Risk Analyst → Risk Team Leader) — penunjukan penandatangan tiap jenjang dapat disesuaikan dengan struktur organisasi Bank.
- **Permintaan kerja antar-divisi** — permintaan kerja terarah antar divisi langsung di dalam sistem (mis. RM meminta Legal memeriksa akta), dengan penugasan otomatis dan notifikasi — menggantikan koordinasi informal via WhatsApp.
- **SLA tracking per tahap** dengan notifikasi saat SLA terancam/terlampaui, berbasis kalender hari kerja Jakarta (termasuk hari libur nasional).
- **QR sign/verify** per penandatangan per dokumen — token kriptografis yang diterbitkan Mizan, dapat diverifikasi kapan pun.
- **Rapat Komite digital** — ketua rapat mencatat keputusan per aplikasi; anggota Komite yang hadir menandatangani Minutes of Meeting (MoM) secara digital via QR (kuorum minimal 2 penandatangan).
- **Review & adendum fasilitas** — fasilitas yang sudah cair dapat di-review (inisiatif Bank; default tiap 12 bulan dengan pengingat jatuh tempo otomatis) atau di-adendum (permintaan nasabah). Keduanya melewati pipeline penuh dan tersambung sebagai satu silsilah, sehingga "ketentuan terkini" suatu fasilitas selalu jelas.
- **Append-only audit trail** — setiap aksi tercatat permanen; tidak ada data yang bisa dihapus atau diubah diam-diam. Siap diaudit regulator.

### 3.2 AI Drafting & Asistensi

- **Analisis 5C+1S berbantuan AI** — AI menyusun draft analisis 5C+1S atas perintah RM (bukan otomatis); skor penilaiannya selalu dihitung ulang oleh sistem — bukan oleh AI — dan terkunci saat aplikasi naik tahap. RM yang memutuskan kapan dan apakah draft dipakai.
- **AI memahami konteks nasabah dan pengajuan** — draft AI disusun dengan latar belakang yang dirakit otomatis dari data sistem (profil nasabah, riwayat pengajuan sebelumnya, asal pengajuan) ditambah catatan tim yang tercatat atas nama penulisnya, sehingga hasilnya lebih relevan. Konteks yang boleh dipakai diatur per jenis tugas; khusus ekstraksi dokumen, AI sengaja bekerja tanpa konteks pengajuan lain agar data antar nasabah tidak pernah tercampur.
- **Summarisasi SLIK/Pefindo** — ringkasan hasil penarikan biro kredit.
- **OCR otomatis + cross-check antar dokumen** — dokumen yang diupload (KTP, rekening koran, laporan keuangan, dll.) diekstrak otomatis, lalu sistem membandingkan silang antar sumber (mis. SPT vs laporan keuangan, akta vs data nasabah) sebagai peringatan advisory; RM mengonfirmasi hasil ekstraksi sebelum dipakai, dan hanya verifikasi NIK yang bersifat memblokir.
- **AI advisory untuk Risk Analyst** — rekomendasi approve/conditional/reject beserta reasoning, bersifat non-otoritatif (masukan, bukan keputusan).
- **Asisten tanya-jawab dalam aplikasi** — pengguna dapat bertanya tentang berkas pengajuan dalam bahasa sehari-hari, dengan pengaman dan pencatatan audit yang sama seperti seluruh fitur AI lainnya.

### 3.3 Guardrail AI (Prinsip "AI Membantu, Manusia Memutuskan")

- AI **tidak pernah menulis ke field otoritatif** — semua nilai DSR/LTV/Kolektibilitas dihitung oleh sistem dari input yang dikonfirmasi manusia.
- Output AI **tidak dapat masuk** ke MUAP/RSK yang sudah dibekukan atau ditandatangani.
- **PII di-mask sebelum dikirim ke model AI** (nama → `[NASABAH]`, NIK → `[NIK]`, dst.) — penyamaran berbasis aturan yang berjalan di dalam aplikasi, dengan pemetaan nama-samaran tersimpan aman di database Bank; perilaku masking diuji otomatis di CI dan wajib aktif sebelum data nasabah nyata masuk sistem (lihat compliance gates di Bagian 7).
- **Setiap pemanggilan AI diaudit** — prompt dan respons tersimpan dalam kondisi ter-mask.

### 3.4 Manajemen Dokumen

- **Template MUAP, RSK, MoM & SP3 di Google Docs** — dibangun dari dokumen referensi asli Bank; data sistem diisi otomatis satu arah dengan mekanisme anti-kebocoran (placeholder tidak pernah lolos ke dokumen final). Setelah terisi, dokumen sepenuhnya milik penyusun untuk diedit di Google Docs seperti biasa.
- **Pengenalan dokumen dari Google Drive** — RM cukup meletakkan dokumen sumber di folder Google Drive pengajuan, dengan struktur folder bebas; Mizan memindai folder dan mencocokkan nama file ke checklist dokumen wajib (status: terpenuhi / belum ditemukan / perlu peninjauan) berdasarkan aturan penamaan yang dapat dikelola admin — tanpa pernah membaca isi dokumen — lengkap dengan tombol "Pindai ulang".
- **Akses dokumen terkelola otomatis** — dokumen yang dihasilkan sistem dimiliki akun resmi Mizan, dengan pintasan ke folder kerja masing-masing user; hak baca diberikan otomatis kepada setiap pengguna aktif, dan hak tulis diberikan otomatis hanya saat diperlukan, per dokumen, sesuai peran maker-checker. Dokumen tidak pernah dibagikan lewat tautan publik.
- **PDF frozen sebagai bukti audit** — versi final dibekukan dan disimpan permanen (tidak dapat diubah), dengan integritas yang dapat diverifikasi via hash.
- **Versioning + rollback dokumen** — riwayat versi lengkap dan dapat dikembalikan ke versi sebelumnya; tidak ada versi yang hilang.

---

## 4. Pengembangan 2 Pekan ke Depan

Mengikuti hasil diskusi dengan tim bisnis (10 Juni 2026), dua integrasi berikut menjadi prioritas pengembangan terdekat:

### 4.1 Integrasi Google Drive — Import Aplikasi Aktif

**Tujuan:** pipeline aktif yang saat ini tersimpan di Google Drive Hijra dapat dibaca dan diimpor ke Mizan, sehingga RM tidak perlu input ulang dari awal.

Yang akan dibangun:
- Read + write ke Google Drive via Google Docs API (OAuth/service account Hijra).
- Import data aplikasi eksisting ke dalam pipeline Mizan.
- AI dapat membaca isi dokumen dari Drive sebagai bahan analisis.

**Prasyarat dari sisi Hijra:** kesepakatan standar struktur folder dan penamaan file di Google Drive (misalnya `/FOS/[NamaNasabah]-[Tahun]/`, file `MUAP_v1.docx`, `RekeningKoran_BCA.pdf`). Tanpa standar ini, sistem tidak dapat mengenali dokumen secara andal dan otomatis.

### 4.2 Integrasi Google Sheets — Analisis Data Keuangan

**Tujuan:** hasil olahan RM di Google Sheets (netting rekening koran, perbandingan mutasi vs laporan keuangan, tren sales) mengalir langsung ke sistem — tanpa copy-paste manual ke MUAP.

Yang akan dibangun:
- Mizan membaca data dari Google Sheets yang sudah diolah RM.
- AI menggunakan hasil olahan tersebut sebagai konteks tambahan untuk draft narasi MUAP.

**Catatan:** Fineksi (analisis rekening koran berbayar per-request) tetap digunakan untuk sementara; integrasi atau penggantiannya dapat dievaluasi di fase berikutnya sesuai kebutuhan dan biaya.

---

## 5. Roadmap Pengembangan Berikutnya

Arah pengembangan berikut sudah teridentifikasi dari kebutuhan tim bisnis dan menjadi kandidat fase setelah 2 pekan ke depan:

### 5.1 AI Analisis per Sektor

Konteks bisnis nasabah sangat beragam (fashion muslim, marketplace, supplier, dll.) dengan pola transaksi yang berbeda meski satu sektor — analisis generik tidak cukup tajam.

- Profil sektor sebagai konteks AI (custom instruction per sektor/jenis usaha).
- AI membandingkan pola transaksi nasabah dengan referensi sektor yang relevan.
- RM dapat mendefinisikan/menyesuaikan konteks usaha di Mizan, sehingga draft narasi 5C lebih tajam dan relevan.

### 5.2 AI Transkripsi Recording Meeting → Konten MUAP

Saat ini RM merekam meeting nasabah lalu mentranskripsi dan mengekstrak informasinya secara manual menggunakan tools eksternal (NotebookLM/Gemini/GPT) di luar sistem.

- Upload file audio recording langsung di Mizan.
- AI mentranskripsi dan mengidentifikasi informasi relevan (tujuan pembiayaan, kondisi usaha, jaminan, dll.).
- Output: draft konten kualitatif MUAP (analisis 5C) + ringkasan sebagai MoM pertemuan.
- Seluruh proses berjalan di dalam Mizan: ter-mask, ter-audit, tidak bocor ke tools eksternal.

### 5.3 AI Counter-Offer saat Gerbang Kelayakan Tidak Lolos

Saat ini, jika pengajuan tidak lolos gerbang kelayakan (DSR/LTV/Kolektibilitas), RM menyusun ulang struktur pembiayaan secara manual — mencoba-coba angka sampai lolos.

- Saat gerbang tidak lolos, AI mengusulkan beberapa struktur alternatif (misalnya plafond diturunkan, tenor diperpanjang, atau agunan ditambah).
- Setiap usulan divalidasi ulang oleh perhitungan gerbang yang sama di sistem sebelum ditampilkan — AI mengusulkan, sistem memverifikasi, RM yang memutuskan.
- Bersifat advisory: usulan tidak pernah mengubah angka pengajuan secara otomatis; struktur final tetap diinput oleh RM.

---

## 6. Teknologi & Arsitektur (Ringkas)

| Layer | Pilihan | Catatan |
|---|---|---|
| Frontend | Next.js + React + TypeScript | Sesuai standar TypeScript Hijra |
| Backend | Node.js + TypeScript | Satu bahasa untuk seluruh stack — handover lebih mudah |
| Database | PostgreSQL | Sumber data tunggal: data aplikasi, audit trail, pemetaan nama-samaran |
| Autentikasi | Firebase Auth + RBAC | Role & permission tersimpan di Postgres; opsi SSO ke IdP Hijra terbuka |
| Penyimpanan dokumen | SeaweedFS (object storage) | PDF frozen tersimpan immutable, integritas terverifikasi via hash |
| AI | Gemini via Google Cloud Vertex AI (region Singapura) | Hijra sudah pelanggan GCP — DPA eksisting menjadi basis kepatuhan |
| PII Masking | Penyamaran berbasis aturan, berjalan di dalam aplikasi | Bukan layanan eksternal; pengenalan entitas Bahasa Indonesia (NER) ada di roadmap |
| Editing dokumen | Google Docs (pengisian otomatis satu arah) | Tim tetap bekerja di Google Docs yang familiar |
| Deployment | Docker Compose, on-premise | Akses internal (VPN), tidak terekspos publik |

**Standar rekayasa:** test coverage ≥75% per stack (unit + integration + E2E, skenario format Gherkin), dokumentasi arsitektur C4 di dalam repo, CI/CD dengan SAST gate, monorepo Nx — saat ini lebih dari 700 pengujian otomatis sudah berjalan pada setiap perubahan kode.

**Estimasi biaya AI operasional:** dengan volume ~30 pembiayaan/bulan, biaya inferensi AI diperkirakan hanya beberapa dolar per bulan (≈ $0,10–0,25 per pembiayaan) — efisien berkat masking, context caching, dan model yang tepat guna.

---

## 7. Keamanan & Kepatuhan

Mizan didesain sejak awal untuk konteks regulasi BPRS:

- **POJK No. 34/2025 (TI untuk BPR/BPRS)** — sistem dan data dirancang untuk berada di infrastruktur dalam wilayah Indonesia; inferensi AI berjalan via Vertex AI region Singapura dengan DPA + masking (jalur yang sah saat ini; ketentuan inferensi dalam negeri berlaku efektif 17 Desember 2026).
- **UU No. 27/2022 (UU PDP)** — transfer data lintas batas mengikuti jalur Pasal 56(b): DPA dengan Google (Hijra sudah pelanggan GCP) ditambah masking/pseudonymization, sehingga data identitas nasabah tidak dikirim terbuka ke model AI.
- **Audit-ready by design** — append-only ledger untuk approval, riwayat, dan versi dokumen; setiap interaksi AI terekam; integritas PDF frozen dapat diverifikasi via hash.

> **Catatan penting:** 5 compliance gates (posisi OJK terkait offshore inference, DPIA, opini DPS, Vendor DPA, dan keputusan final inference provider) masih pending. Data nasabah nyata belum boleh masuk sistem sebelum gates ini terpenuhi. Penyelesaian gates ini memerlukan keterlibatan aktif tim Legal/Compliance Hijra.

---

## 8. Ruang Lingkup Penawaran

### Termasuk dalam penawaran ini

- Produk Mizan sebagaimana dideskripsikan di Bagian 3 (fitur eksisting).
- Pengembangan 2 pekan ke depan sebagaimana Bagian 4 (integrasi Google Drive + Google Sheets).
- Dokumentasi teknis dan arsitektur (C4) di dalam repository.
- Test suite (unit, integration, E2E) dengan coverage ≥75%.

### Tidak termasuk dalam penawaran ini

| Item | Keterangan |
|---|---|
| **Implementasi di ekosistem Hijra Bank** | Deployment, provisioning infrastruktur, konfigurasi jaringan/VPN, dan integrasi ke lingkungan IT Hijra **berada di luar scope penawaran ini** — dapat dibahas sebagai engagement terpisah |
| Integrasi core banking (T24/IBSS/dll.) | Input data via upload manual (CSV/Excel/PDF); integrasi otomatis = change request pasca-launch |
| Aplikasi mobile native (iOS/Android) | Tidak termasuk versi ini |
| Branding, logo, copywriting konten | Tanggung jawab Bank |
| Lisensi pihak ketiga (cloud, layanan eksternal) | Dibayar Bank secara terpisah |
| Migrasi data massal (>10.000 record) | Engagement terpisah |
| Penetration testing eksternal formal | Dilakukan tim Security Bank; vendor melakukan remediasi |
| Penyelesaian compliance gates (DPIA, opini DPS, dll.) | Memerlukan tim Legal/Compliance Hijra; vendor mendukung dari sisi teknis |

---

## 9. Langkah Berikutnya

1. **Kesepakatan standar Google Drive** — struktur folder dan penamaan file (prasyarat integrasi Bagian 4.1).
2. **Review dokumen ini** oleh tim bisnis dan IT Hijra.
3. **Penjadwalan demo** fitur eksisting untuk tim yang belum melihat sistem berjalan.
4. **Pembahasan komersial** — harga, payment terms, dan warranty dibahas terpisah dalam kontrak kerja.

---

*Dokumen ini adalah draft penawaran produk. Ketentuan komersial (harga, pembayaran, garansi) diatur dalam kontrak kerja terpisah.*
