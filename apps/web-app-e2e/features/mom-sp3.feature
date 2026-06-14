Feature: Committee document generation (MoM / SP3)
  As the committee / RM
  I want to generate the Minutes of Meeting and the offer letter from a decided application
  So that the committee outcome is captured in the Hijra documents

  Scenario: Committee generates the MoM from a decided application
    Given a fixture application at stage 5 with:
      | komiteDecision | approve |
    And I sign in as "Dewi Kirana"
    When I open the komite room for the fixture application
    Then I see the button "Buat Notulen (MoM)"
    And I click "Buat Notulen (MoM)" and a document is generated

  Scenario: RM generates the SP3 from an approved application
    Given a fixture application at stage 5 with:
      | komiteDecision | approve |
    And I sign in as "Siti Rahma"
    When I open the komite room for the fixture application
    Then I see the button "Buat SP3"
    And I click "Buat SP3" and a document is generated
