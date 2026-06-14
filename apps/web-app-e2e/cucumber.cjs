module.exports = {
  default: [
    '--require-module tsx',
    '--require apps/web-app-e2e/support/world.ts',
    '--require apps/web-app-e2e/steps/**/*.ts',
    '--format progress',
    '--format html:apps/web-app-e2e/reports/cucumber.html',
    'apps/web-app-e2e/features/**/*.feature',
  ].join(' '),
}
