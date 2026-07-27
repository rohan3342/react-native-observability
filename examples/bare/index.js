/**
 * Bare React Native entry point. Registers the root component under the app
 * name declared in app.json.
 */
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
