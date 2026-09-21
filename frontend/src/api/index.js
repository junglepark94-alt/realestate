import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const fetchApartments = () => api.get('/apartments').then(r => r.data);

export const fetchTransactions = (aptId, months = 12) =>
  api.get(`/transactions/${aptId}`, { params: { months } }).then(r => r.data);

export const fetchFavorites = () => api.get('/favorites').then(r => r.data.favorites);

export const setFavorite = (aptId, on) =>
  api.request({ url: `/favorites/${aptId}`, method: on ? 'put' : 'delete' })
    .then(r => r.data.favorites);

// 단지 새로고침: 시작(POST) / 진행 상태(GET). 429(쿨다운·다른 단지 수집 중)도 본문을 그대로 돌려줌
export const startRefresh = (aptId) =>
  api.post(`/refresh/${aptId}`, null, { validateStatus: (s) => s === 200 || s === 429 })
    .then(r => r.data);

export const fetchRefreshStatus = (aptId) => api.get(`/refresh/${aptId}`).then(r => r.data);

export const fetchListings = (aptId) =>
  api.get(`/listings/${aptId}`, { timeout: 30000 }).then(r => r.data);
