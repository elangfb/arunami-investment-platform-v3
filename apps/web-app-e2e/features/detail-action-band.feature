Feature: Application detail — task-first action band & grouped tabs
  As a pipeline participant
  I want the detail page to surface my task and group the surfaces
  So that I know what to do without hunting through ten tabs

  Scenario: Account Officer sees the intake action at stage 1
    Given I sign in as "Siti Rahma"
    When I open application "FOS-2026-001"
    Then the action band shows "Kirim ke Legal, Agunan & Biro"
    And I see the button "Kirim ke Legal, Agunan & Biro"

  Scenario: Loan Analyst sees the feasibility action at stage 3
    Given I sign in as "Budi Santoso"
    When I open application "FOS-2026-014"
    Then the action band shows "Lengkapi analisa 5C+1S"
    And I see the button "Kirim ke Risk Review"

  Scenario: Legal Officer sees the legal review at stage 2
    Given I sign in as "Laila Ahmadi"
    When I open application "FOS-2026-003"
    Then the action band shows "Verifikasi dokumen"
    And I see the button "Selesaikan Analisa Yuridis"

  Scenario: Risk Team opens the RSK ladder for an approved app at stage 4
    Given I sign in as "Ahmad Fauzi"
    When I open application "FOS-2026-007"
    Then I see the button "Buka RSK"

  Scenario: Committee member opens the committee room at stage 5
    Given I sign in as "Dewi Kirana"
    When I open application "FOS-2026-009"
    Then I see the link "Buka Ruang Komite"

  Scenario: A non-owner sees a read-only status line
    Given I sign in as "Budi Santoso"
    When I open application "FOS-2026-001"
    Then the action band shows "Owner · Siti Rahma"

  Scenario: The detail page groups the surfaces into four tabs
    Given I sign in as "Budi Santoso"
    When I open application "FOS-2026-014"
    Then I see the tab "Berkas"
    And I see the tab "Penilaian"
    And I see the tab "Pencairan"
    And I see the tab "Aktivitas"

  Scenario: A view deep-link opens the matching sub-tab
    Given I sign in as "Budi Santoso"
    When I open application "FOS-2026-016" at view "rsk"
    Then the "RSK" tab is selected
