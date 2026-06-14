Feature: Create financing application
  As an Account Officer
  I want to create a financing application
  So that it appears in the active pipeline

  Scenario: AO creates a financing application and finds it in the pipeline
    Given I am logged in as an Account Officer
    When I create a Murabahah financing application
    Then I can find the application in the pipeline
