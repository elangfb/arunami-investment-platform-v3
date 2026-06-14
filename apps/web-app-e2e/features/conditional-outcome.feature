Feature: Committee conditional outcome & terminal closure
  As a pipeline participant
  I want conditional recommendations to reach the committee and conditional decisions
  to branch on the nasabah's response
  So that an application can proceed to disbursement or end cleanly

  Scenario: Risk Analyst forwards a CONDITIONAL recommendation to the committee
    Given a fixture application at stage 4 with:
      | riskRecommendation | conditional |
    And I sign in as "Ahmad Fauzi"
    When I open the fixture application
    Then I see the button "Kirim ke Komite"

  Scenario: RM records the nasabah response to a conditional approval
    Given a fixture application at stage 1 with:
      | komiteDecision | conditional |
    And I sign in as "Siti Rahma"
    When I open the fixture application at view "pencairan"
    Then I see the button "Nasabah Setuju — Lanjutkan Pencairan"
    And I see the button "Nasabah Tidak Setuju — Tutup Pengajuan"

  Scenario: A closed application shows the terminal state in Pencairan
    Given a fixture application at stage 1 with:
      | komiteDecision      | conditional     |
      | conditionalResponse | declined        |
      | applicationStatus   | closed          |
      | closeReason         | nasabah-decline |
    And I sign in as "Siti Rahma"
    When I open the fixture application at view "pencairan"
    Then the action band shows "Pengajuan Ditutup"
