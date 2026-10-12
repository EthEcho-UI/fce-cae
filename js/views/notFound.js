export async function render() {
  const root = document.createElement('div');
  root.className = 'page';
  root.innerHTML = '<h1 class="page-title">Page not found</h1><p><a href="#/">Go home</a></p>';
  return root;
}
