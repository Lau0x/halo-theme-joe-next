/**
 * 图库页 · 懒加载 + isotope 布局
 *
 * v2 修复（refs upstream#353 图片顺序错乱）：
 * 1. IntersectionObserver 复用一个实例，避免每次分页追加都新建 → 防 memory leak
 * 2. Layout 调用做 debounce 合并，避免每张图 onload 都独立 layout 引发视觉抖动
 * 3. isotope 加 sortBy='original-order'，锚定后端给的顺序——防 append 跨页导致视觉"乱序"
 * 4. loadingIndicator null-safe，分页完成后不再崩
 */
function createPhotoPageLoader({ initialPage, totalPage, fetchPage, appendItems, finish, onError }) {
    let page = initialPage;
    let inFlight = false;
    let finished = false;

    return async function loadPageData() {
        if (inFlight || finished) return false;
        inFlight = true;
        try {
            if (page > totalPage) {
                finished = true;
                finish();
                return false;
            }
            const items = await fetchPage(page);
            if (!items.length) {
                finished = true;
                finish();
                return false;
            }
            appendItems(items);
            page++;
            if (page > totalPage) {
                finished = true;
                finish();
            }
            return true;
        } catch (error) {
            onError(error);
            return false;
        } finally {
            inFlight = false;
        }
    };
}

$(document).ready(function () {
    const gridEl = document.querySelector('#image-grid');
    if (!gridEl) return;

    const $grid = $(gridEl).isotope({
        itemSelector: '.grid-item',
        percentPosition: true,
        masonry: {
            columnWidth: '.grid-item'
        },
        // 按 data-order（后端迭代顺序）锚定，防止异步 append 错乱
        getSortData: {
            'original-order': function (itemElem) {
                return parseInt(itemElem.getAttribute('data-order') || '0', 10);
            }
        },
        sortBy: 'original-order'
    });

    const initialPage = Number(gridEl.getAttribute('data-index')) + 1;
    const totalPage = Number(gridEl.getAttribute('data-total'));
    const baseUrl = ThemeConfig.blog_url;
    const loadingIndicator = document.querySelector('.joe_loading');
    let observerForLoading = null;
    function finishLoading() {
        if (observerForLoading) observerForLoading.disconnect();
        if (loadingIndicator) loadingIndicator.remove();
    }

    // 合并 layout — 多张图并发加载时 debounce 80ms 再 layout，避免抖动
    let layoutTimer = null;
    function scheduleLayout() {
        clearTimeout(layoutTimer);
        layoutTimer = setTimeout(function () {
            $grid.isotope('layout');
        }, 80);
    }

    // 模块级 Observer 复用，避免 leak
    const lazyObserver = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            const image = entry.target.querySelector('.lazy-load');
            if (!image) {
                obs.unobserve(entry.target);
                return;
            }
            image.onload = scheduleLayout;
            image.src = image.dataset.src;
            image.classList.remove('lazy-load');
            obs.unobserve(entry.target);
        });
    }, {
        threshold: 0.1
    });

    function observeLazy(nodes) {
        const iter = (nodes && nodes.length) ? nodes : document.querySelectorAll('.grid-item');
        iter.forEach(function (item) {
            if (item.querySelector && item.querySelector('.lazy-load')) {
                lazyObserver.observe(item);
            }
        });
    }

    observeLazy(); // 首屏绑定

    const loadPageData = createPhotoPageLoader({
        initialPage,
        totalPage,
        fetchPage: async function (page) {
            const response = await fetch(baseUrl + '/photos/page/' + page);
            if (!response.ok) throw new Error('Photo page request failed: ' + response.status);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            return doc.querySelectorAll('.grid-item');
        },
        appendItems: function (nextPageImages) {
            const newItems = [];
            nextPageImages.forEach(function (image) {
                $grid.append(image).isotope('appended', image);
                newItems.push(image);
            });
            observeLazy(newItems);       // 只观察新增节点，不 rebind 全部
            $grid.isotope('layout');
        },
        finish: finishLoading,
        onError: function (error) {
            console.error('Error fetching next page data:', error);
        }
    });

    if (loadingIndicator) {
        observerForLoading = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) {
                loadPageData();
            }
        }, {
            threshold: 1
        });
        observerForLoading.observe(loadingIndicator);
    }

    $('.joe_photos__filter button').on('click', function () {
        const filterValue = $(this).attr('data-sjslink');
        const $button = $(this);
        const $item = $button.closest('li');
        $button.attr('aria-pressed', 'true');
        $item
            .addClass('active')
            .siblings()
            .removeClass('active')
            .find('button')
            .attr('aria-pressed', 'false');
        $grid.isotope({
            filter: function () {
                const sjselValue = $(this).attr('data-sjsel');
                return filterValue === '*' || sjselValue === filterValue;
            }
        });
    });
});
