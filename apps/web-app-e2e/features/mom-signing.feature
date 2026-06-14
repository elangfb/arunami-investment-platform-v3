Feature: Rapat Komite — signed MoM is the decision (ADR-0005)
  As the committee
  I want the Ketua to record the outcome and every attending member to sign the MoM
  So that the decision applies only when the signed Komite minutes are complete

  Scenario: The committee decides via outcome + MoM signatures; participants attest non-blocking
    Given a fixture application at stage 5
    And a committee meeting for the fixture application
    And I sign in as "Dewi Kirana"
    When I open the komite room for the fixture application
    And I click the button "Approve"
    And I click the button "Catat Keputusan"
    Then I see the text "menunggu tanda tangan MoM"
    # An added involved-team participant (RM) attests — recorded but NOT counted toward the Komite quorum
    Given I sign in as "Budi Santoso"
    When I open the komite room for the fixture application
    And I click the button "Tanda Tangan MoM"
    Then I see the text "0/3 Komite menandatangani"
    # The attending Komite are the blocking signers
    Given I sign in as "Dewi Kirana"
    When I open the komite room for the fixture application
    And I click the button "Tanda Tangan MoM"
    Then I see the text "1/3 Komite menandatangani"
    Given I sign in as "Rizky Hadiman"
    When I open the komite room for the fixture application
    And I click the button "Tanda Tangan MoM"
    Then I see the text "2/3 Komite menandatangani"
    Given I sign in as "Nur Fatimah"
    When I open the komite room for the fixture application
    And I click the button "Tanda Tangan MoM"
    Then I see the text "Tanda Tangan MoM Komite"
