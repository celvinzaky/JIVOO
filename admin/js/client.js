/**
 * admin/js/client.js (ES module)
 * Single shared ApiClient instance for the whole Super Admin app.
 */
import { ApiClient } from '../../js/api.js';

export const api = new ApiClient('admin');
