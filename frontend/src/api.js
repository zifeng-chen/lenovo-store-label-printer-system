import axios from 'axios';

const http = axios.create({
  baseURL: '/api',
  timeout: 30000
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.msg || error.message || '请求失败';
    return Promise.reject(new Error(message));
  }
);

export async function getProducts(q = '') {
  const response = await http.get('/products', { params: q ? { q } : {} });
  return response.data.data;
}

export async function createProduct(payload) {
  const response = await http.post('/products', payload);
  return response.data.data;
}

export async function updateProduct(id, payload) {
  const response = await http.put(`/products/${id}`, payload);
  return response.data.data;
}

export function deleteProduct(id) {
  return http.delete(`/products/${id}`);
}

export function batchDeleteProducts(ids) {
  return http.post('/products/batch-delete', { ids });
}

export function importProducts(file) {
  const form = new FormData();
  form.append('file', file);
  return http.post('/products/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}

export function exportProducts() {
  return http.get('/products/export', { responseType: 'blob' });
}

export function backupDatabase() {
  return http.get('/backup', { responseType: 'blob' });
}

export function restoreDatabase(file) {
  const form = new FormData();
  form.append('file', file);
  return http.post('/restore', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}
