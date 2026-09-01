/* 获取直属子元素 */
function getChildren(el, className) {
	for (let item of el.children) if (item.className === className) return item;
	return null;
}

document.addEventListener("DOMContentLoaded", () => {
	$(".joe_detail__article p:empty").remove();

	customElements.define(
		"joe-mtitle",
		class JoeMtitle extends HTMLElement {
			constructor() {
				super();
				this.innerHTML = `
				<span class="joe_mtitle">
					<span class="joe_mtitle__text">
						${this.getAttribute("title") || "默认标题"}
					</span>
				</span>
			`;
			}
		}
	);

	// customElements.define(
	// 	"joe-pdf",
	// 	class JoePdf extends HTMLElement {
	// 		constructor() {
	// 			super();
	// 			this.options = {
	// 				src: this.getAttribute("src") || "",
	// 				width: this.getAttribute("width") || "100%",
	// 				height: this.getAttribute("height") || "500px",
	// 			};
	// 			this.render();
	// 		}
	// 		render() {
	// 			if (!this.options.src) return (this.innerHTML = "pdf地址未填写！");
	// 			this.innerHTML = `
	// 			<div class="joe_pdf">
	//         <iframe src="${ThemeConfig.BASE_RES_URL}/source/lib/pdfjs/web/viewer.html?file=${this.options.src}" style="width:${this.options.width};height:${this.options.height}"></iframe>
	//       </div>`;
	// 		}
	// 	}
	// );

	customElements.define(
		"joe-mp3",
		class JoeMp3 extends HTMLElement {
			constructor() {
				super();
				this.options = {
					name: this.getAttribute("name"),
					url: this.getAttribute("url"),
					theme: this.getAttribute("theme") || "#1989fa",
					cover: this.getAttribute("cover")|| "",
					autoplay: this.getAttribute("autoplay") ? true : false,
				};
				this.render();
			}
			render() {
				if (!this.options.url) return (this.innerHTML = "音频地址未填写！");
				this.innerHTML =
          "<span style=\"display: block\" class=\"_content\"></span>";
				new APlayer({
					container: getChildren(this, "_content"),
					theme: this.options.theme,
					autoplay: this.options.autoplay,
					audio: [
						{
							url: this.options.url,
							name: this.options.name,
							cover: this.options.cover,
						},
					],
				});
			}
		}
	);

	customElements.define(
		"joe-music",
		class JoeMusic extends HTMLElement {
			constructor() {
				super();
				this.options = {
					id: this.getAttribute("id"),
					color: this.getAttribute("color") || "#1989fa",
					autoplay: !!this.getAttribute("autoplay"),
				};
				this.render();
			}
			render() {
				if (!this.options.id) return (this.innerHTML = "网易云歌曲ID未填写！");
				this.innerHTML =
          "<span style=\"display: block\" class=\"_content\"></span>";
				fetch(
					"https://www.vvhan.com/usr/themes/Joe/NeteaseCloudMusicApi.php?id=" +
            this.options.id
				).then(async (response) => {
					const audio = await response.json();
					new APlayer({
						container: getChildren(this, "_content"),
						lrcType: 1,
						theme: this.options.color,
						autoplay: this.options.autoplay,
						audio,
					});
				});
			}
		}
	);

	customElements.define(
		"joe-mlist",
		class JoeMlist extends HTMLElement {
			constructor() {
				super();
				this.options = {
					id: this.getAttribute("id"),
					color: this.getAttribute("color") || "#1989fa",
					autoplay: this.getAttribute("autoplay") ? true : false,
				};
				this.render();
			}
			render() {
				if (!this.options.id) return (this.innerHTML = "网易云歌单ID未填写！");
				this.innerHTML =
          "<span style=\"display: block\" class=\"_content\"></span>";
				fetch(
					"https://api.i-meto.com/meting/api?server=netease&type=playlist&id=" +
            this.options.id
				).then(async (response) => {
					const audio = await response.json();
					new APlayer({
						container: getChildren(this, "_content"),
						lrcType: 3,
						theme: this.options.color,
						autoplay: this.options.autoplay,
						audio,
					});
				});
			}
		}
	);

	customElements.define(
		"joe-abtn",
		class JoeAbtn extends HTMLElement {
			constructor() {
				super();
				this.options = {
					icon: this.getAttribute("icon") || "",
					color: this.getAttribute("color") || "#ff6800",
					href: this.getAttribute("href") || "#",
					radius: this.getAttribute("radius") || "17.5px",
					content: this.getAttribute("content") || "多彩按钮",
				};
				this.innerHTML = `
                    <a class="joe_abtn" style="background: ${this.options.color}; border-radius: ${this.options.radius}" href="${this.options.href}" target="_blank" rel="noopener noreferrer nofollow">
                        <span class="joe_abtn__icon">
                            <i class="${this.options.icon} fa"></i>
                        </span>
                        <span class="joe_abtn__content">
                            ${this.options.content}
                        </span>
                    </a>
                `;
			}
		}
	);

	customElements.define(
		"joe-anote",
		class JoeAnote extends HTMLElement {
			constructor() {
				super();
				this.options = {
					icon: this.getAttribute("icon") || "fa-download",
					href: this.getAttribute("href") || "#",
					type: /^secondary$|^success$|^warning$|^error$|^info$/.test(
						this.getAttribute("type")
					)
						? this.getAttribute("type")
						: "secondary",
					content: this.getAttribute("content") || "标签按钮",
				};
				this.innerHTML = `
					<a class="joe_anote ${this.options.type}" href="${this.options.href}" target="_blank" rel="noopener noreferrer nofollow">
						<span class="joe_anote__icon">
							<i class="fa ${this.options.icon}"></i>
						</span>
						<span class="joe_anote__content">
							${this.options.content}
						</span>
					</a>
				`;
			}
		}
	);

	customElements.define(
		"joe-dotted",
		class JoeDotted extends HTMLElement {
			constructor() {
				super();
				this.startColor = this.getAttribute("startColor") || "#ff6c6c";
				this.endColor = this.getAttribute("endColor") || "#1989fa";
				this.innerHTML = `
					<span class="joe_dotted" style="background-image: repeating-linear-gradient(-45deg, ${this.startColor} 0, ${this.startColor} 20%, transparent 0, transparent 25%, ${this.endColor} 0, ${this.endColor} 45%, transparent 0, transparent 50%)"></span>
				`;
			}
		}
	);

	customElements.define(
		"joe-cloud",
		class JoeCloud extends HTMLElement {
			constructor() {
				super();
				this.options = {
					type: this.getAttribute("type") || "default",
					title: this.getAttribute("title") || "默认标题",
					url: this.getAttribute("url"),
					password: this.getAttribute("password"),
				};
				const type = {
					default: "默认网盘",
					360: "360网盘",
					bd: "百度网盘",
					ty: "天翼网盘",
					ct: "城通网盘",
					wy: "微云网盘",
					github: "Github仓库",
					gitee: "Gitee仓库",
					lz: "蓝奏云网盘",
					ad: "阿里云盘",
				};
				this.innerHTML = `
					<span class="joe_cloud">
						<div class="joe_cloud__logo _${this.options.type}"></div>
						<div class="joe_cloud__describe">
							<div class="joe_cloud__describe-title">${this.options.title}</div>
							<div class="joe_cloud__describe-type">来源：${
	type[this.options.type] || "默认网盘"
}${
	this.options.password ? " | 提取码：" + this.options.password : ""
}</div>
						</div>
						<a class="joe_cloud__btn" href="${
	this.options.url
}" target="_blank" rel="noopener noreferrer nofollow">
							<i class="fa fa-download"></i>
						</a>
					</span>
				`;
			}
		}
	);


	customElements.define(
		"joe-read-limited",
		class JoeReadLimited extends HTMLElement {
			constructor() {
				super();
				this.options = {
					username: this.getAttribute("username"),
					displayName: this.getAttribute("display-name"),
					commentName: this.getAttribute("comment-name"),
					commentKind: this.getAttribute("comment-kind"),
					commentPlugin: this.getAttribute("comment-plugin"), // 'CommentWidgetPlugin' | 'WalinePlugin'
				};
				this.$article = this.closest('.joe_detail__article');
				this.$comment = document.querySelector('.joe_comment');
				this.$commentHost = null;
				this.$header = document.querySelector('.joe_header');
				this.isUserCommented = false; // 是否已经评论过
				this.checking = false; // 是否正在检查评论
				// JRL-debug: console.log('JoeReadLimited options:', this.options)
				this.initialize().catch((error) => {
					console.error('JoeReadLimited 初始化失败，已展示完整内容：', error);
					this.failOpen();
				});
			}

			disconnectedCallback() {
				if (this.isRemoving) return;
				if (this.ownsRuntime || window.__joeReadLimitedOwner === this) {
					const ownsRuntime = this.ownsRuntime === true;
					this.cleanupRuntime();
					if (ownsRuntime) this.$article?.classList.remove('limited');
				}
			}

			async initialize() {
				if (
					this.options.commentPlugin !== 'CommentWidgetPlugin' ||
					!this.$article ||
					!this.$comment ||
					!this.$header ||
					!this.options.username ||
					!this.options.commentName ||
					!this.options.commentKind ||
					(this.options.username !== 'anonymousUser' && !this.options.displayName)
				) {
					this.failOpen();
					return;
				}
				if (!this.claimOwnership()) {
					this.failOpen();
					return;
				}

				this.$commentHost = await this.waitForCommentHost();
				if (!this.$commentHost || !this.isCommentHostReady(this.$commentHost)) {
					this.failOpen();
					return;
				}

				if (!this.render()) return;
				if (!this.isConnected || !this.isCommentHostReady(this.$commentHost)) {
					this.failOpen();
					return;
				}

				this.$article.classList.add('limited');
				if (!this.startCommentHostObserver()) return;

				if (this.options.username !== 'anonymousUser') { // 非匿名用户才检查评论
					this.commentWidgetPluginCheckComment();
				}
			}

			claimOwnership() {
				if (window.__joeReadLimitedOwner && window.__joeReadLimitedOwner !== this) {
					return false;
				}
				window.__joeReadLimitedOwner = this;
				this.ownsRuntime = true;
				return true;
			}

			waitForCommentHost() {
				const deadline = Date.now() + 2500;
				return new Promise((resolve) => {
					const check = () => {
						this.readinessTimer = null;
						if (!this.isConnected) return resolve(null);
						const host =
							document.querySelector('.joe_comment halo-comment') ||
							document.querySelector('.joe_comment comment-widget') ||
							document.getElementById(this.getCommentMountId());
						if (this.isCommentHostReady(host)) return resolve(host);
						if (Date.now() >= deadline) return resolve(null);
						this.readinessTimer = setTimeout(check, 50);
					};
					check();
				});
			}

			getCommentMountId() {
				return `comment-content-halo-run-${this.options.commentKind}-${this.options.commentName}`;
			}

			isCommentMountReady(host) {
				return Boolean(
					host &&
					host.isConnected &&
					host.id === this.getCommentMountId() &&
					this.$comment?.contains(host) &&
					customElements.get('comment-widget')
				);
			}

			isActivatedCommentWidgetReady(widget, mount) {
				return Boolean(
					widget &&
					widget.localName === 'comment-widget' &&
					widget.isConnected &&
					mount?.contains(widget) &&
					customElements.get('comment-widget') &&
					this.getCommentHostRoot(widget)
				);
			}

			waitForMountActivation() {
				const mount = this.$commentHost;
				if (!this.isCommentMountReady(mount) || this.activationTimer) return;
				const deadline = Date.now() + 3000;
				const check = () => {
					this.activationTimer = null;
					if (!this.ownsRuntime || !this.isConnected || !this.isCommentMountReady(mount)) {
						this.failOpen();
						return;
					}
					const widget = mount.querySelector('comment-widget');
					if (this.isActivatedCommentWidgetReady(widget, mount)) return;
					if (Date.now() >= deadline) {
						this.failOpen();
						return;
					}
					this.activationTimer = setTimeout(check, 50);
				};
				check();
			}

			getCommentHostRoot(host) {
				if (!host?.shadowRoot) return null;
				if (host.localName === 'halo-comment') {
					return host.shadowRoot.querySelector('#halo-comment');
				}
				if (host.localName === 'comment-widget') {
					const root = host.shadowRoot.querySelector(
						'.comment-widget, #comment-widget, [data-comment-widget-root]'
					);
					if (!root) return null;
					return root.childElementCount > 0 || root.querySelector('form, textarea, button')
						? root
						: null;
				}
				return null;
			}

			isCommentHostReady(host) {
				if (this.isCommentMountReady(host)) return true;
				return Boolean(
					host &&
					host.isConnected &&
					customElements.get(host.localName) &&
					this.getCommentHostRoot(host) &&
					(host === document.querySelector('.joe_comment halo-comment') ||
						host === document.querySelector('.joe_comment comment-widget'))
				);
			}

			startCommentHostObserver() {
				const observerRoot = this.$comment?.parentElement;
				if (!observerRoot || typeof MutationObserver !== 'function') {
					this.failOpen();
					return false;
				}
				this.commentHostObserver = new MutationObserver(() => {
					if (
						!this.isConnected ||
						!this.$comment?.isConnected ||
						!this.isCommentHostReady(this.$commentHost)
					) {
						this.failOpen();
					}
				});
				this.commentHostObserver.observe(observerRoot, { childList: true, subtree: true });
				return true;
			}

			isCommentSubmissionRequest(url, options) {
				const requestUrl =
					typeof url === 'string'
						? url
						: typeof URL === 'function' && url instanceof URL
							? url.href
							: typeof Request === 'function' && url instanceof Request
								? url.url
								: url?.url;
				const requestMethod = String(options?.method || url?.method || 'GET').toUpperCase();
				if (!requestUrl || requestMethod !== 'POST') return false;
				try {
					return new URL(requestUrl, window.location.origin).pathname ===
						'/apis/api.halo.run/v1alpha1/comments';
				} catch (error) {
					return false;
				}
			}

			commentWidgetPluginCheckComment() {
				// JRL-debug: console.log('call commentWidgetPluginCheckComment');
				this.runIntervalTask();
				if (
					!this.isConnected ||
					!this.$article?.classList.contains('limited') ||
					!this.isCommentHostReady(this.$commentHost)
				) return;

				const isUseResetFetch = true; // 是否使用重置 fetch 请求 ajax 方法，在其中进行捕获提交的评论
				if (!isUseResetFetch || typeof window.fetch !== 'function') {
					// 方式一：定时检查评论方式
					this.checkTimer = setInterval(() => {
						this.runIntervalTask();
					}, 3000);
				} else {
					// 方式二：覆盖 commentWidgetPlugin fetch 请求 ajax 方法，在其中进行捕获提交的评论
					const originalFetch = window.fetch;
					this.originalFetch = originalFetch;
					// JRL-debug: console.log('JoeReadLimited 覆盖 commentWidgetPlugin fetch 请求 ajax 方法！')
					this.fetchWrapper = (url, options, ...args) => {
						let isCommentSubmission;
						try {
							isCommentSubmission = this.isCommentSubmissionRequest(url, options);
						} catch (error) {
							this.failOpen();
							throw error;
						}
						let pro;
						try {
							pro = originalFetch.call(window, url, options, ...args);
						} catch (error) {
							if (isCommentSubmission) this.failOpen();
							throw error;
						}
						try {
							if (!isCommentSubmission) return pro;
							if (!pro || typeof pro.then !== 'function') {
								this.failOpen();
								return pro;
							}
							return pro.then(
								(res) => {
									let responseOk;
									try {
										if (!res || typeof res.ok !== 'boolean') {
											this.failOpen();
											return res;
										}
										responseOk = res.ok;
									} catch (error) {
										this.failOpen();
										throw error;
									}
									if (
										responseOk &&
										this.options.username !== 'anonymousUser' &&
										!this.isUserCommented
									) { // 提交评论成功，说明用户已经评论
										this.removeReadLimited();
									}
									return res;
								},
								(error) => {
									this.failOpen();
									throw error;
								}
							);
						} catch (error) {
							this.failOpen();
							throw error;
						}
					};
					window.fetch = this.fetchWrapper;
				}
			}

			walineCheckComment() {
				// JRL-debug: console.log('call walineCheckComment');

				// TODO qiushaocloud: 我目前没有 waline 服务器，无法测试 waline 插件的评论检查功能，希望有能力的伙伴可以帮忙实现一下。我这里提供的是一种定时的思路，也可以参考下 commentWidgetPluginCheckComment 的两种实现方式。
				
				// 方式一：定时检查评论方式
				this.runIntervalTask();
				this.checkTimer = setInterval(() => {
					this.runIntervalTask();
				}, 3000);

			}

			runIntervalTask() {
				if (this.options.username === 'anonymousUser') {
					// JRL-debug: console.log('JoeReadLimited 匿名用户，不检查评论！');
					this.checkTimer && clearInterval(this.checkTimer);
					this.checkTimer = null;
					return;
				}

				if (this.isUserCommented) {
					// JRL-debug: console.log('JoeReadLimited 已经评论过，不再检查评论！')
					this.removeReadLimited();
					return;
				}

				if (this.checking)
					return;

				this.checking = true;
				try {
					this.findFirstMyComment(1, (isFinduserComment) => {
						this.checking = false;

						if (isFinduserComment == null) {
							// JRL-debug: console.log('JoeReadLimited 评论查找功能未实现或不可用，展示完整内容！');
							this.failOpen();
							return;
						}

						if (isFinduserComment) {
							// JRL-debug: console.log('JoeReadLimited 找到评论，不再检查评论！')
							this.isUserCommented = true;
							this.removeReadLimited();
							return;
						}
					});
				} catch (error) {
					console.error('JoeReadLimited 评论检查失败，已展示完整内容：', error);
					this.failOpen();
				}
			}

			cleanupRuntime() {
				if (!this.ownsRuntime) return;
				this.checking = false;
				this.readinessTimer && clearTimeout(this.readinessTimer);
				this.readinessTimer = null;
				this.activationTimer && clearTimeout(this.activationTimer);
				this.activationTimer = null;
				this.checkTimer && clearInterval(this.checkTimer);
				this.checkTimer = null;
				this.commentHostObserver?.disconnect();
				this.commentHostObserver = null;
				if (this.fetchWrapper && this.originalFetch && window.fetch === this.fetchWrapper) {
					window.fetch = this.originalFetch;
				}
				this.fetchWrapper = null;
				this.originalFetch = null;
				if (window.__joeReadLimitedOwner === this) {
					delete window.__joeReadLimitedOwner;
				}
				this.ownsRuntime = false;
			}

			failOpen() {
				const ownsRuntime = this.ownsRuntime === true;
				this.cleanupRuntime();
				if (ownsRuntime) this.$article?.classList.remove('limited');
				if (!this.isRemoving) {
					this.isRemoving = true;
					try {
						this.remove();
					} finally {
						this.isRemoving = false;
					}
				}
			}

			removeReadLimited () {
				// JRL-debug: console.log('call removeReadLimited')
				if (!this.ownsRuntime) {
					this.remove();
					return;
				}
				this.cleanupRuntime();
				this.isUserCommented = true;
				this.querySelector('.joe_read_limited')?.setAttribute('hidden', '');
				this.$article?.classList.remove('limited');
			}
			
			findFirstMyComment (page, onCallback) {
				const username = this.options.username;
				const displayName = this.options.displayName;

				if (
					username === 'anonymousUser' ||
					!username ||
					!displayName ||
					!this.options.commentName ||
					!this.options.commentKind ||
					typeof $ === 'undefined' ||
					typeof $.ajax !== 'function'
				) {
					// JRL-debug: console.log('findFirstMyComment 匿名用户，不查找评论！, page:', page, ' ,displayName:', displayName, ' ,username:', username)
					return onCallback(null);
				}

				if (this.options.commentPlugin === 'CommentWidgetPlugin') { // halo-comment-widget 插件，即 halo 默认评论插件
					const reqUrl = `/apis/api.halo.run/v1alpha1/comments?group=content.halo.run&kind=${this.options.commentKind}&name=${this.options.commentName}&page=${page}&size=20&version=v1alpha1`;
					// // JRL-debug: console.log('findFirstMyComment CommentWidgetPlugin ajax get reqUrl:', reqUrl, ' ,page:', page, ' ,displayName:', displayName, ' ,username:', username)
					$.ajax({
						url: reqUrl,
						type: "GET",
						timeout: 10000, // 10秒超时
					}).then((res) => {
						if (!res || !Array.isArray(res.items)) {
							return onCallback(null);
						}
						const items = res.items;
						if (!items.length) {
							// // JRL-debug: console.log('findFirstMyComment CommentWidgetPlugin 没有找到评论！, reqUrl:', reqUrl, ' ,page:', page, ' ,displayName:', displayName, ' ,username:', username)
							return onCallback(false);
						}

						let userComment = null;
						for(let i = 0; i < items.length; i++) {
							const item = items[i];
							const owner = (item.spec &&item.spec.owner) || item.owner;
							if (!owner) continue;

							if (owner.name) { // 使用用户名判断，但是现在评论组件 name 并没有给出，所以暂时使用 displayName 判断，此处先实现，如果后续有 name 字段，则就用 name 判断
								if (owner.name === username) {
									userComment = item;
									break
								}
							} else { // 使用 displayName 判断，这种判断方式会有问题，比如昵称相同但用户名不同，这种情况会误判，但是现在没办法，因为评论组件没有提供 name 字段
								if (owner.displayName === displayName) {
									userComment = item;
									break
								}
							}
						}

						if (userComment) {
							// JRL-debug: console.log('findFirstMyComment CommentWidgetPlugin 找到评论！, reqUrl:', reqUrl, ' ,page:', page, ' ,displayName:', displayName, ' ,username:', username, ' ,userComment:', userComment)
							return onCallback(!!userComment);
						}

						if (res.hasNext) { // 还有下一页，则继续查找
							// // JRL-debug: console.log('findFirstMyComment CommentWidgetPlugin 还有下一页，继续查找！, reqUrl:', reqUrl, ' ,page:', page, ' ,displayName:', displayName, ' ,username:', username)
							return this.findFirstMyComment(page + 1, onCallback);
						}

						// // JRL-debug: console.log('findFirstMyComment CommentWidgetPlugin 没有找到评论！, reqUrl:', reqUrl, ' ,page:', page, ' ,displayName:', displayName, ' ,username:', username)
						return onCallback(false);
					}).catch((xhr, status, error) => {
						console.error('findFirstMyComment CommentWidgetPlugin catch err:', !!xhr, status, error, ' ,reqUrl:', reqUrl, ' ,page:', page, ' ,displayName:', displayName, ' ,username:', username);
						return onCallback(null);
					});

					return;
				}

				// waline 插件
				if (this.options.commentPlugin === 'WalinePlugin') { // TODO qiushaocloud: waline 插件评论查找功能未实现，因为没有 waline 服务器，希望有这个能力的伙伴可以帮忙实现
					console.warn('findFirstMyComment WalinePlugin 暂不支持查找评论！, page:', page, ' ,displayName:', displayName, ' ,username:', username);
					onCallback(null);
					return;
				}

				console.warn('findFirstMyComment 未知评论插件，暂不支持查找评论！, page:', page, ' ,displayName:', displayName, ' ,username:', username, ' ,commentPlugin:', this.options.commentPlugin);
				return onCallback(null);
			}

			render() {
				this.innerHTML =
          			`<div class="joe_read_limited" data-username="${this.options.username}" data-display-name="${this.options.displayName}" data-comment-name="${this.options.commentName}" data-comment-kind="${this.options.commentKind}">
						<p><i class="joe-font joe-icon-locker" style="color:#f5840d;"></i>
						${
							this.options.username === 'anonymousUser' ? 
							'&nbsp;此处内容仅作客户端视觉折叠，请 <span class="joe_read_limited__button need-login">登录并评论后展开</span>；仅为客户端视觉效果，不适合私密或付费内容' :
							'&nbsp;'+(this.options.displayName)+' 您已登录，请 <span class="joe_read_limited__button logined">评论后展开</span>；仅为客户端视觉效果，不适合私密或付费内容'
						}
						</p>
					</div>`;
				this.$button = this.querySelector(".joe_read_limited__button");
				const postID = $(".joe_detail").attr("data-cid");
				// JRL-debug: console.log(postID)
				if (!this.$button || !this.$comment || !this.$commentHost || !this.$header) {
					this.failOpen();
					return false;
				}
				this.$button.addEventListener("click", (e) => {
					e.stopPropagation();
					if (!this.isCommentHostReady(this.$commentHost)) {
						this.failOpen();
						return;
					}

					if (this.options.username === 'anonymousUser') {
						// JRL-debug: console.log('JoeReadLimited 匿名用户，跳转到登录页面！')
						window.location.href='/console/login?redirect_uri='+window.location.href;
						return
					}

					// 下滑到评论区
					const scrollTarget = this.isCommentMountReady(this.$commentHost)
						? this.$commentHost
						: this.$comment;
					const scrollTop =
						scrollTarget.getBoundingClientRect().top +
						window.pageYOffset -
						this.$header.offsetHeight -
						15;
					const scrollDuration = window.matchMedia(
						"(prefers-reduced-motion: reduce)"
					).matches
						? 0
						: 500;
					$("html,body").animate(
						{
							scrollTop,
						},
						scrollDuration
					);
					if (this.isCommentMountReady(this.$commentHost)) {
						this.waitForMountActivation();
					}
				});
				return true;
			}
		}
	);

	customElements.define(
		"joe-card-default",
		class JoeCardDefault extends HTMLElement {
			constructor() {
				super();
				const _temp = getChildren(this, "_temp");
				this.options = {
					width: this.getAttribute("width") || "100%",
					label: this.getAttribute("label") || "卡片标题",
					content:
            _temp.innerHTML.trim().replace(/^(<br>)|(<br>)$/g, "") ||
            "卡片内容",
				};
				const htmlStr = `
				<div class="joe_card__default" style="width: ${this.options.width}">
					<div class="joe_card__default-title">${this.options.label}</div>
					<div class="joe_card__default-content">${this.options.content}</div>
				</div>
			`;
				if (getChildren(this, "_content")) {
					getChildren(this, "_content").innerHTML = htmlStr;
				} else {
					const span = document.createElement("span");
					span.style.display = "block";
					span.className = "_content";
					span.innerHTML = htmlStr;
					this.appendChild(span);
				}
			}
		}
	);

	customElements.define(
		"joe-message",
		class JoeMessage extends HTMLElement {
			constructor() {
				super();
				this.options = {
					type: /^success$|^info$|^warning$|^error$/.test(
						this.getAttribute("type")
					)
						? this.getAttribute("type")
						: "info",
					content: this.getAttribute("content") || "消息内容",
				};
				this.innerHTML = `
					<span class="joe_message ${this.options.type}">
						<span class="joe_message__icon"></span>
						<span class="joe_message__content">${this.options.content}</span>
					</span>
				`;
			}
		}
	);

	customElements.define(
		"joe-progress",
		class JoeProgress extends HTMLElement {
			constructor() {
				super();
				this.options = {
					percentage: /^\d{1,3}%$/.test(this.getAttribute("percentage"))
						? this.getAttribute("percentage")
						: "50%",
					color: this.getAttribute("color") || "#ff6c6c",
				};
				this.innerHTML = `
				<span class="joe_progress">
					<div class="joe_progress__strip">
						<div class="joe_progress__strip-percent" style="width: ${this.options.percentage}; background: ${this.options.color};"></div>
					</div>
					<div class="joe_progress__percentage">${this.options.percentage}</div>
				</span>
			`;
			}
		}
	);

	customElements.define(
		"joe-callout",
		class JoeCallout extends HTMLElement {
			constructor() {
				super();
				const _temp = getChildren(this, "_temp");
				this.options = {
					color: this.getAttribute("color") || "#f0ad4e",
					content:
            _temp.innerHTML.trim().replace(/^(<br>)|(<br>)$/g, "") ||
            "标注内容",
				};
				const htmlStr = `
					<div class="joe_callout" style="border-left-color: ${this.options.color};">
						${this.options.content}
					</div>
				`;
				if (getChildren(this, "_content")) {
					getChildren(this, "_content").innerHTML = htmlStr;
				} else {
					const span = document.createElement("span");
					span.style.display = "block";
					span.className = "_content";
					span.innerHTML = htmlStr;
					this.appendChild(span);
				}
			}
		}
	);

	customElements.define(
		"joe-card-describe",
		class JoeCardDescribe extends HTMLElement {
			constructor() {
				super();
				const _temp = getChildren(this, "_temp");
				this.options = {
					title: this.getAttribute("title") || "卡片描述",
					content:
            _temp.innerHTML.trim().replace(/^(<br>)|(<br>)$/g, "") ||
            "卡片内容",
				};
				const htmlStr = `
					<div class="joe_card__describe">
						<div class="joe_card__describe-title">${this.options.title}</div>
						<div class="joe_card__describe-content">${this.options.content}</div>
					</div>
				`;
				if (getChildren(this, "_content")) {
					getChildren(this, "_content").innerHTML = htmlStr;
				} else {
					const span = document.createElement("span");
					span.style.display = "block";
					span.className = "_content";
					span.innerHTML = htmlStr;
					this.appendChild(span);
				}
			}
		}
	);

	customElements.define(
		"joe-card-list",
		class JoeCardList extends HTMLElement {
			constructor() {
				super();
				const _temp = getChildren(this, "_temp");
				let _innerHTML = _temp.innerHTML.trim().replace(/^(<br>)|(<br>)$/g, "");
				let content = "";
				_innerHTML.replace(
					/{card-list-item}([\s\S]*?){\/card-list-item}/g,
					function ($0, $1) {
						content += `<div class="joe_card__list-item">${$1
							.trim()
							.replace(/^(<br>)|(<br>)$/g, "")}</div>`;
					}
				);
				let htmlStr = `<div class="joe_card__list">${content}</div>`;
				if (getChildren(this, "_content")) {
					getChildren(this, "_content").innerHTML = htmlStr;
				} else {
					const span = document.createElement("span");
					span.className = "_content";
					span.style.display = "block";
					span.innerHTML = htmlStr;
					this.appendChild(span);
				}
			}
		}
	);

	customElements.define(
		"joe-alert",
		class JoeAlert extends HTMLElement {
			constructor() {
				super();
				const _temp = getChildren(this, "_temp");
				this.options = {
					type: /^success$|^info$|^warning$|^error$/.test(
						this.getAttribute("type")
					)
						? this.getAttribute("type")
						: "info",
					content:
            _temp.innerHTML.trim().replace(/^(<br>)|(<br>)$/g, "") ||
            "警告提示",
				};
				const htmlStr = `
					<div class="joe_alert ${this.options.type}">
						${this.options.content}
					</div>
				`;
				if (getChildren(this, "_content")) {
					getChildren(this, "_content").innerHTML = htmlStr;
				} else {
					const span = document.createElement("span");
					span.style.display = "block";
					span.className = "_content";
					span.innerHTML = htmlStr;
					this.appendChild(span);
				}
			}
		}
	);

	customElements.define(
		"joe-timeline",
		class JoeTimeline extends HTMLElement {
			constructor() {
				super();
				const _temp = getChildren(this, "_tpl");
				let _innerHTML = _temp.innerHTML.trim().replace(/^(<br>)|(<br>)$/g, "");
				let content = "";
				_innerHTML.replace(
					/{timeline-item([^}]*)}([\s\S]*?){\/timeline-item}/g,
					function ($0, $1, $2) {
						content += `
					<div class="joe_timeline__item">
						<div class="joe_timeline__item-tail"></div>
						<div class="joe_timeline__item-circle" ${$1}></div>
						<div class="joe_timeline__item-content">${$2
		.trim()
		.replace(/^(<br>)|(<br>)$/g, "")}</div>
					</div>
				`;
					}
				);
				let htmlStr = `<div class="joe_timeline">${content}</div>`;
				if (getChildren(this, "_content")) {
					getChildren(this, "_content").innerHTML = htmlStr;
				} else {
					const span = document.createElement("span");
					span.className = "_content";
					span.style.display = "block";
					span.innerHTML = htmlStr;
					this.appendChild(span);
				}
				this.querySelectorAll(".joe_timeline__item-circle").forEach(
					(item, index) => {
						const color = item.getAttribute("color") || "#19be6b";
						item.style.borderColor = color;
					}
				);
				
				_temp.parentNode.removeChild(_temp); // 清理无用标签
			}
		}
	);

	customElements.define(
		"joe-collapse",
		class JoeCollapse extends HTMLElement {
			constructor() {
				super();
				const _temp = getChildren(this, "_temp");
				let _innerHTML = _temp.innerHTML.trim().replace(/^(<br>)|(<br>)$/g, "");
				let content = "";
				_innerHTML.replace(
					/{collapse-item([^}]*)}([\s\S]*?){\/collapse-item}/g,
					function ($0, $1, $2) {
						content += `
					<div class="joe_collapse__item" ${$1}>
						<div class="joe_collapse__item-head">
							<div class="joe_collapse__item-head--label"></div>
							<svg class="joe_collapse__item-head--icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><path d="M7.406 7.828L12 12.422l4.594-4.594L18 9.234l-6 6-6-6z"/></svg>
						</div>
						<div class="joe_collapse__item-wrapper">
							<div class="joe_collapse__item-wrapper--content">${$2
		.trim()
		.replace(/^(<br>)|(<br>)$/g, "")}</div>
						</div>
					</div>
				`;
					}
				);
				let htmlStr = `<div class="joe_collapse">${content}</div>`;
				if (getChildren(this, "_content")) {
					getChildren(this, "_content").innerHTML = htmlStr;
				} else {
					const span = document.createElement("span");
					span.className = "_content";
					span.style.display = "block";
					span.innerHTML = htmlStr;
					this.appendChild(span);
				}
				this.querySelectorAll(".joe_collapse__item").forEach((item) => {
					const label = item.getAttribute("label") || "折叠标题";
					const head = getChildren(item, "joe_collapse__item-head");
					const headLabel = getChildren(head, "joe_collapse__item-head--label");
					headLabel.innerHTML = label;
					const wrapper = getChildren(item, "joe_collapse__item-wrapper");
					const content = getChildren(
						wrapper,
						"joe_collapse__item-wrapper--content"
					);
					const open = item.getAttribute("open");
					if (open !== null) {
						item.classList.add("active");
						wrapper.style.maxHeight = "none";
					}
					head.addEventListener("click", (e) => {
						e.stopPropagation();
						wrapper.style.maxHeight = content.offsetHeight + "px";
						let timer = setTimeout(() => {
							if (item.classList.contains("active")) {
								item.classList.remove("active");
								wrapper.style.maxHeight = 0;
							} else {
								item.classList.add("active");
								wrapper.style.maxHeight = content.offsetHeight + "px";
							}
							clearTimeout(timer);
							timer = null;
						}, 30);
					});
				});
			}
		}
	);


	customElements.define(
		"joe-dplayer",
		class JoeDplayer extends HTMLElement {
			constructor() {
				super();
				this.options = {
					src: this.getAttribute("src") || "",
					player:
            this.getAttribute("player") ||
            `${ThemeConfig.BASE_RES_URL}/assets/lib/dplayer/web/${ThemeConfig.BASE_RES_URL==='/themes/theme-Joe3'?'dplayer':'dplayer-source'}.html?url=`,
					width: this.getAttribute("width") || "100%",
					height: this.getAttribute("height") || "500px",
				};
				this.render();
			}
			render() {
				if (this.options.src)
					this.innerHTML = `<iframe loading="lazy" allowfullscreen="true" class="joe_vplayer" src="${
						this.options.player + this.options.src
					}" style="width:${this.options.width};height:${
						this.options.height
					}"></iframe>`;
				else this.innerHTML = "视频地址未填写！";
			}
		}
	);

	customElements.define(
		"joe-bilibili",
		class JoeBilibili extends HTMLElement {
			constructor() {
				super();
				this.options = {
					bvid: this.getAttribute("bvid"),
					page: +(this.getAttribute("page") || "1"),
					width: this.getAttribute("width") || "100%",
					height: this.getAttribute("height") || "500px",
				};
				this.render();
			}
			render() {
				if (this.options.bvid)
					this.innerHTML = `<iframe loading="lazy" allowfullscreen="true" class="joe_vplayer" src="//player.bilibili.com/player.html?bvid=${this.options.bvid}&page=${this.options.page}" style="width:${this.options.width};height:${this.options.height}"></iframe>`;
				else this.innerHTML = "bvid未填写！";
			}
		}
	);
  
	customElements.define(
		"joe-raw-content",
		class JoeRawContent extends HTMLElement {
			constructor() {
				super();
				this.options = {
					content: this.querySelector("#_raw"),
					width: this.getAttribute("width") || "unset",
					height: this.getAttribute("height") || "unset",
				};
				this.render();
			}
			render() {
				if (this.options.content) {
					const shadowRoot = this.attachShadow({ mode: "closed" });
					shadowRoot.appendChild(this.options.content);
				}
			}
		}
	);

	customElements.define(
		"joe-tabs",
		class JoeTabs extends HTMLElement {
			constructor() {
				super();
				const _temp = getChildren(this, "_tpl");
				let _innerHTML = _temp.innerHTML.trim().replace(/^(<br>)|(<br>)$/g, "");
				let navs = "";
				let contents = "";
				_innerHTML.replace(
					/{tabs-pane([^}]*)}([\s\S]*?){\/tabs-pane}/g,
					function ($0, $1, $2) {
						navs += `<div class="joe_tabs__head-item" label="${$1}"></div>`;
						contents += `<div style="display: none" class="joe_tabs__body-item" label="${$1}">${$2
							.trim()
							.replace(/^(<br>)|(<br>)$/g, "")}</div>`;
					}
				);
				let htmlStr = `
                <div class="joe_tabs">
                    <div class="joe_tabs__head">${navs}</div>
                    <div class="joe_tabs__body">${contents}</div>
                </div>
            `;
				if (getChildren(this, "_content")) {
					getChildren(this, "_content").innerHTML = htmlStr;
				} else {
					const span = document.createElement("span");
					span.className = "_content";
					span.style.display = "block";
					span.innerHTML = htmlStr;
					this.appendChild(span);
				}
				this.querySelectorAll(".joe_tabs__head-item").forEach((item, index) => {
					const label = item.getAttribute("label");
					item.innerHTML = label;
					item.addEventListener("click", (e) => {
						e.stopPropagation();
						this.querySelectorAll(".joe_tabs__head-item").forEach((_item) =>
							_item.classList.remove("active")
						);
						this.querySelectorAll(".joe_tabs__body-item").forEach(
							(_item) => (_item.style.display = "none")
						);
						if (this.querySelector(`.joe_tabs__body-item[label="${label}"]`)) {
							this.querySelector(
								`.joe_tabs__body-item[label="${label}"]`
							).style.display = "block";
						}
						item.classList.add("active");
					});
					if (index === 0) item.click();
				});
				
				_temp.parentNode.removeChild(_temp); // 清理无用标签
			}
		}
	);

	customElements.define(
		"joe-gird",
		class JoeGird extends HTMLElement {
			constructor() {
				super();
				this.options = {
					column:
            isNaN(this.getAttribute("column")) || !this.getAttribute("column")
            	? 3
            	: this.getAttribute("column"),
					gap:
            isNaN(this.getAttribute("gap")) || !this.getAttribute("gap")
            	? 15
            	: this.getAttribute("gap"),
				};
				const _temp = getChildren(this, "_temp");
				let _innerHTML = _temp.innerHTML.trim().replace(/^(<br>)|(<br>)$/g, "");
				let contents = "";
				_innerHTML.replace(
					/{gird-item}([\s\S]*?){\/gird-item}/g,
					function ($0, $1) {
						contents += `<div class="joe_gird__item">${$1
							.trim()
							.replace(/^(<br>)|(<br>)$/g, "")}</div>`;
					}
				);
				let htmlStr = `<div class="joe_gird" style="gap: ${this.options.gap}px; grid-template-columns: repeat(${this.options.column}, 1fr);">${contents}</div>`;
				if (getChildren(this, "_content")) {
					getChildren(this, "_content").innerHTML = htmlStr;
				} else {
					const span = document.createElement("span");
					span.className = "_content";
					span.style.display = "block";
					span.innerHTML = htmlStr;
					this.appendChild(span);
				}
			}
		}
	);

	customElements.define(
		"joe-copy",
		class JoeCopy extends HTMLElement {
			constructor() {
				super();
				this.options = {
					title: this.getAttribute("title") || "点击复制",
					content: this.getAttribute("content") || "默认文本",
					color: this.getAttribute("color") || "inherit",
					bold: this.getAttribute("bold") != null ? "bold" : "normal",
				};
				this.innerHTML = `<span class="joe_copy" style="cursor: pointer; user-select: none;font-weight:${this.options.bold};color:${this.options.color};">${this.options.title}</span>`;
				const button = getChildren(this, "joe_copy");
				if (typeof ClipboardJS !== "undefined" && typeof Qmsg !== "undefined") {
					new ClipboardJS(button, { text: () => this.options.content }).on(
						"success",
						() => Qmsg.success("复制成功！")
					);
				} else {
					button.addEventListener("click", () =>
						alert("该功能请前往前台查看！")
					);
				}
			}
		}
	);

	customElements.define(
		"joe-copy-icon",
		class JoeCopyIcon extends HTMLElement {
			constructor() {
				super();
				this.options = {
					title: this.getAttribute("title") || '',
					icon: this.getAttribute("icon") || "joe-font joe-icon-copy",
					content: this.getAttribute("content") || "默认文本",
					spanStyle: this.getAttribute("spanStyle") || "",
					iconStyle: this.getAttribute("iconStyle") || "",
				};
				this.innerHTML = `<span class="joe_copy" style="cursor: pointer; user-select: none;word-break: break-all;${this.options.spanStyle}">${this.options.title}<i style="margin-left:4px;display:inline;${this.options.iconStyle}" class="${this.options.icon}"></i></span>`;
				const button = getChildren(this, "joe_copy");
				if (typeof ClipboardJS !== "undefined" && typeof Qmsg !== "undefined") {
					new ClipboardJS(button, { text: () => this.options.content }).on(
						"success",
						() => Qmsg.success("复制成功！")
					);
				} else {
					button.addEventListener("click", () =>
						alert("该功能请前往前台查看！")
					);
				}
			}
		}
	);

	$(".joe_detail__article p:empty").remove();
});
