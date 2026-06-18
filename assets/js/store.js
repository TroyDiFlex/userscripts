import { initStore } from './common.js';

initStore({
  visibility: 'public',
  mountEl: document.getElementById('grid'),
  searchEl: document.getElementById('search'),
  filtersEl: document.getElementById('filters'),
  emptyMsg: 'Ничего не найдено',
});
