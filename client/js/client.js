/**
 * client/js/client.js (ES module)
 * Single shared ApiClient instance for the whole Client Back Office app.
 * namespace='client' keeps its tokens separate from the Super Admin app's
 * (namespace='admin') in localStorage.
 */
import { ApiClient } from '../../js/api.js';

export const api = new ApiClient('client');
