Feature: Firebase emulator login
  The real Google-popup login path works against the Firebase Auth emulator.

  Scenario: Account Officer signs in through the Firebase emulator popup
    Given I sign in through the Firebase emulator as "Siti Rahma"
    Then I am on the dashboard
