const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Patches the AndroidManifest so RNBackgroundActionsTask:
 *  - declares android:foregroundServiceType="dataSync" (required on Android 14+)
 *  - sets android:stopWithTask="false" so the foreground service (and its
 *    persistent notification) survives the user swiping the app from recents
 *  - sets android:exported="false" for security
 */
module.exports = function withBackgroundActions(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    if (!application.service) application.service = [];

    const FULL_NAME = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
    const SHORT_NAME = '.RNBackgroundActionsTask';

    const existing = application.service.find(
      (s) =>
        s.$?.['android:name'] === FULL_NAME ||
        s.$?.['android:name'] === SHORT_NAME
    );

    if (existing) {
      existing.$['android:foregroundServiceType'] = 'dataSync';
      existing.$['android:stopWithTask'] = 'false';
      existing.$['android:exported'] = 'false';
    } else {
      application.service.push({
        $: {
          'android:name': FULL_NAME,
          'android:foregroundServiceType': 'dataSync',
          'android:stopWithTask': 'false',
          'android:exported': 'false',
        },
      });
    }

    return config;
  });
};
