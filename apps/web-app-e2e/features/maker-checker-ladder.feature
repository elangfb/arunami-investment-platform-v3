Feature: Maker-checker signature ladder (MUAP)
  As the financing team
  I want the MUAP to require a two-rung maker-checker ladder before it advances
  So that no proposal reaches Risk Review without a single checker's approval

  Scenario: The MUAP ladder shows the maker's request action
    Given a fixture application at stage 3
    And I sign in as "Budi Santoso"
    When I open the fixture application at view "muap"
    Then I see the text "Rantai Persetujuan MUAP"
    And I see the button "Ajukan Persetujuan"

  Scenario: A complete MUAP ladder (RM to TL) carries the deal into Risk Review
    Given a fixture application at stage 3
    And I sign in as "Budi Santoso"
    When I open the fixture application at view "muap"
    And I click the button "Ajukan Persetujuan"
    Then I see the text "Menunggu Team Leader / Supervisor"
    When I sign in as "Teguh Laksana"
    And I open the fixture application at view "muap"
    And I click the button "Setujui"
    Then I see the text "Final — lengkap"

  Scenario: A checker sends the MUAP back to the maker with a reason
    Given a fixture application at stage 3
    And I sign in as "Budi Santoso"
    When I open the fixture application at view "muap"
    And I click the button "Ajukan Persetujuan"
    When I sign in as "Teguh Laksana"
    And I open the fixture application at view "muap"
    And I click the button "Kembalikan ke Pengaju"
    And I fill "Agunan belum sesuai" into the reason field
    And I click the button "Kirim Pengembalian"
    Then I see the text "Dikembalikan ke pengaju"

  Scenario: A signed MUAP rung exposes a verifiable QR
    Given a fixture application at stage 3
    And I sign in as "Budi Santoso"
    When I open the fixture application at view "muap"
    And I click the button "Ajukan Persetujuan"
    When I sign in as "Teguh Laksana"
    And I open the fixture application at view "muap"
    And I click the button "Setujui"
    And I open the QR of the signed rung
    Then I see the text "Tanda tangan sah"
    And I see the text "Teguh Laksana"

  Scenario: A complete RSK ladder (RA to RTL) carries the deal to the Komite queue
    Given a fixture application at stage 4
    And I sign in as "Ahmad Fauzi"
    When I open the fixture application at view "rsk"
    And I click the button "Ajukan Persetujuan"
    Then I see the text "Menunggu Risk Team Leader"
    When I sign in as "Rini Tania Lestari"
    And I open the fixture application at view "rsk"
    And I click the button "Setujui"
    Then I see the text "Final — lengkap"
