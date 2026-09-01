/**文章页逻辑 */
function focusJoeTocHeading(event, fallback) {
	const anchor =
		event?.currentTarget?.closest?.("a[href]") || event?.target?.closest?.("a[href]");
	let heading = null;
	try {
		const hash = anchor?.hash || "";
		if (hash.startsWith("#") && hash.length > 1) {
			heading = document.getElementById(decodeURIComponent(hash.slice(1)));
		}
	} catch (_error) {}
	if (!heading) {
		fallback?.focus();
		return;
	}
	const originalTabindex = heading.getAttribute("tabindex");
	if (originalTabindex === null) heading.setAttribute("tabindex", "-1");
	heading.addEventListener(
		"blur",
		() => {
			if (originalTabindex === null) heading.removeAttribute("tabindex");
			else heading.setAttribute("tabindex", originalTabindex);
		},
		{ once: true }
	);
	heading.focus({ preventScroll: true });
}

const postContext = {
	limited: false,
	/* 初始化评论后展开 */
	// initReadLimit() {
	// 	if (
	// 		PageAttrs.metas_enable_read_limit &&
	// 		PageAttrs.metas_enable_read_limit.trim() !== "true"
	// 	)
	// 		return;
	// 	postContext.limited = true;
	// 	const $article = $(".page-post .joe_detail__article");
	// 	const $content = $("#post-inner");
	// 	const $hideMark = $(".page-post .joe_read_limited");
	// 	const clientHeight =
	// 		document.documentElement.clientHeight || document.body.clientHeight;
	// 	const cid = $(".joe_detail").attr("data-cid");
	//
	// 	// 移除限制
	// 	const removeLimit = () => {
	// 		postContext.limited = false;
	// 		$hideMark.parent().remove();
	// 		$article.removeClass("limited");
	// 		postContext.initToc(true); // 重新渲染TOC
	// 	};
	//
	// 	// 如果文章内容高度小于等于屏幕高度，则自动忽略限制
	// 	if ($content.height() < clientHeight + 180) {
	// 		removeLimit();
	// 		return;
	// 	}
	//
	// 	// 检查本地的 partialIds
	// 	const checkPartialIds = (postId, cb) => {
	// 		const localIds = localStorage.getItem("partialIds");
	// 		if (localIds && localIds.includes(postId)) {
	// 			// console.log("已经评论过了");
	// 			removeLimit(); // 移除限制
	// 		} else {
	// 			cb && cb();
	// 		}
	// 	};
	//
	// 	// 更新当前评论状态
	// 	const updateState = async () => {
	// 		// console.log("评论成功，更新状态");
	// 		const scrollTop = $hideMark.offset().top - 180;
	// 		const localIds = localStorage.getItem("partialIds");
	//
	// 		await Utils.sleep(800); // 延迟一下
	// 		removeLimit(); // 移除限制
	// 		localStorage.setItem("partialIds", localIds ? localIds + "," + cid : cid); // 记录id
	// 		Qmsg.success("感谢您的支持");
	//
	// 		// 滚动到原位置
	// 		$("html,body").animate(
	// 			{
	// 				scrollTop,
	// 			},
	// 			500
	// 		);
	// 	};
	//
	// 	// 监听评论成功事件（区分首次和后续提交）
	// 	const handleCallback = () => {
	// 		// console.log("没有评论记录");
	// 		const commentNode = document.getElementsByTagName("halo-comment")[0];
	// 		commentNode.addEventListener("post-success", (_data) => {
	// 			// console.log(_data, "评论成功");
	// 			// 检查是否已经评论过该文章
	// 			checkPartialIds(cid, updateState);
	// 		});
	// 	};
	//
	// 	checkPartialIds(cid, handleCallback);
	// },
	/* 文章复制 + 版权文字 */
	initCopy() {
		if (PageAttrs.metas_enable_copy === "false" || !ThemeConfig.enable_copy)
			return;

		const curl = location.href;
		const author = $(".joe_detail").attr("data-author");
		const postTitle = $(".joe_detail .joe_detail__title").text();
		const postDescription = $('html head meta[name=description]').attr('content');

		$(".joe_detail__article").on("copy", function (e) {
			const selection = window.getSelection();
			const selectionText = selection.toString().replace(/<已自动折叠>/g, "");

			const appendLink = (ThemeConfig.enable_copy_right_text
				? ThemeConfig.copy_right_text ||
				`\r\n\r\n====================================\r\n文章作者： ${author}\r\n文章来源： ${ThemeConfig.blog_title}(${ThemeConfig.blog_url})\r\n文章标题： ${postTitle}\r\n文章链接： ${curl}\r\n版权声明： 内容遵循 CC BY-NC-SA 4.0 版权协议，转载请附上原文出处链接及本声明。`
				: "")
				.replace(/{postUrl}/g, curl)
				.replace(/{postTitle}/g, postTitle)
				.replace(/{postAuthor}/g, author)
				.replace(/{BlogTitle}/g, ThemeConfig.blog_title)
				.replace(/{BlogUrl}/g, ThemeConfig.blog_url)
				.replace(/{postDescription}/g, postDescription);
				
			if (window.clipboardData) {
				const copytext = selectionText + appendLink;
				window.clipboardData.setData("Text", copytext);
				return false;
			} else {
				const body_element = document.body;
				const copytext = selectionText + appendLink;
				const newdiv = document.createElement("pre");
				newdiv.style.position = "absolute";
				newdiv.style.left = "-99999px";
				body_element.appendChild(newdiv);
				newdiv.innerText = copytext;
				selection.selectAllChildren(newdiv);
				setTimeout(function () {
					body_element.removeChild(newdiv);
				}, 0);
			}
		});
	},
	/* 初始化文章分享 */
	initShare() {
		if (PageAttrs.metas_enable_share === "false" || !ThemeConfig.enable_share)
			return;
		if (ThemeConfig.enable_share_link && $(".icon-share-link").length) {
			$(".icon-share-link").each((_index, item) => {
				const shareLinkEle = $(item)[0];
				const postTitle = shareLinkEle.dataset.postTitle;
				const postDescription = shareLinkEle.dataset.postDescription;
				const postAuthor = shareLinkEle.dataset.postAuthor;
				const template = shareLinkEle.dataset.template;
				
				// 自定义分享链接模版，支持变量 {postUrl}、{postTitle}、{postAuthor}、{postDescription}，留空则使用默认模版(文章链接)，例如: 文章分享: {postAuthor} 发布了文章【{postTitle}】，链接: {postUrl}
				let copyContent = window.location.href;
				if (template) {
					copyContent = template.replace(/{postUrl}/g, location.href)
						.replace(/{postTitle}/g, postTitle)
						.replace(/{postAuthor}/g, postAuthor)
						.replace(/{postDescription}/g, postDescription)
						.replace(/{BlogTitle}/g, ThemeConfig.blog_title)
						.replace(/{BlogUrl}/g, ThemeConfig.blog_url);

					if (!/{postUrl}/.test(template)) { // 如果模版中没有{postUrl}变量，则需要追加文章链接
						copyContent += ` ，文章链接: ${location.href}`;
					}
				}

				new ClipboardJS(shareLinkEle, {
					text: () => copyContent,
				}).on("success", () => Qmsg.success("文章链接已复制"));
			});
		}
		if (ThemeConfig.enable_share_weixin && $(".qrcode_wx").length) {
			$(".qrcode_wx").qrcode({
				width: 140,
				height: 140,
				render: "canvas",
				typeNumber: -1,
				correctLevel: 0,
				background: "#ffffff",
				foreground: "#000000",
				text: location.href,
			});
		}
		const $weixinButtons = $(".share_to_weixin");
		if ($weixinButtons.length) {
			const closeWeixinQrcode = () => {
				$weixinButtons
					.removeClass("active")
					.attr("aria-expanded", "false")
					.attr("aria-label", "显示微信分享二维码")
					.attr("title", "显示微信分享二维码");
			};
			closeWeixinQrcode();
			$weixinButtons.off("click.joeWeixinShare").on("click.joeWeixinShare", function (e) {
				e.stopPropagation();
				const $button = $(this);
				const willOpen = !$button.hasClass("active");
				closeWeixinQrcode();
				if (!willOpen) return;
				$button
					.addClass("active")
					.attr("aria-expanded", "true")
					.attr("aria-label", "收起微信分享二维码")
					.attr("title", "收起微信分享二维码");
			});
			$(document)
				.off("click.joeWeixinShare keydown.joeWeixinShare")
				.on("click.joeWeixinShare", closeWeixinQrcode)
				.on("keydown.joeWeixinShare", (e) => {
					if (e.key !== "Escape") return;
					const $activeButton = $weixinButtons.filter(".active");
					if (!$activeButton.length) return;
					closeWeixinQrcode();
					$activeButton.trigger("focus");
				});
		}
	},
	/* 文章点赞 */
	initLike() {
		if (
			PageAttrs.metas_enable_like === "false" ||
			!ThemeConfig.enable_like ||
			!$(".joe_detail__agree").length
		)
			return;
		const cid = $(".joe_detail").attr("data-cid");
		const clikes = +($(".joe_detail").attr("data-clikes") || 0);
		let agreeArr = localStorage.getItem(encryption("agree"))
			? JSON.parse(decrypt(localStorage.getItem(encryption("agree"))))
			: [];
		let flag = agreeArr.includes(cid);
		const $icons = $(".joe_detail__agree, .post-operate-like");
		const $iconLike = $icons.find(".icon-like");
		const $iconUnlike = $icons.find(".icon-unlike");
		const $likeNum = $icons.find(".nums");
		let likeCount = clikes;
		const syncLikeControl = (pressed) => {
			const label = pressed
				? `已点赞，当前 ${likeCount} 次点赞`
				: `点赞，当前 ${likeCount} 次点赞`;
			$icons
				.attr("aria-pressed", String(pressed))
				.attr("aria-label", label)
				.attr("title", label)
				.prop("disabled", pressed);
		};
		if (flag) {
			$iconUnlike.addClass("active");
		} else {
			$iconLike.addClass("active");
		}
		$likeNum.html(clikes);
		syncLikeControl(flag);
		let _loading = false;
		$icons.on("click", function (e) {
			e.stopPropagation();
			if (_loading || flag) return;
			_loading = true;
			$icons.prop("disabled", true).attr("aria-busy", "true");
			agreeArr = localStorage.getItem(encryption("agree"))
				? JSON.parse(decrypt(localStorage.getItem(encryption("agree"))))
				: [];
			flag = agreeArr.includes(cid);
			if (flag) {
				_loading = false;
				$icons.attr("aria-busy", "false");
				syncLikeControl(true);
				return;
			}

			$.ajax({
				url: "/apis/api.halo.run/v1alpha1/trackers/upvote",
				type: "post",
				contentType: "application/json; charset=utf-8",
				data: JSON.stringify({
					group: "content.halo.run",
					plural: "posts",
					name: cid,
				}),
			})
				.then((_res) => {
					likeCount++;
					agreeArr = localStorage.getItem(encryption("agree"))
						? JSON.parse(decrypt(localStorage.getItem(encryption("agree"))))
						: [];
					if (!agreeArr.includes(cid)) agreeArr.push(cid);
					$iconLike.removeClass("active");
					$iconUnlike.addClass("active");
					$icons.addClass("active");
					flag = true;
					const name = encryption("agree");
					const val = encryption(JSON.stringify(agreeArr));
					localStorage.setItem(name, val);
					$likeNum.html(likeCount).show();
					syncLikeControl(flag);
					_loading = false;
					$icons.attr("aria-busy", "false");
				})
				.catch(() => {
					_loading = false;
					$icons.prop("disabled", false).attr("aria-busy", "false");
				});
		});
	},
	/* 文章目录 */
	initToc(reload) {
		if (
			PageAttrs.metas_enable_toc === "false" ||
			!ThemeConfig.enable_toc ||
			!$(".toc-container").length
		)
			return;

		// 原始内容的文章不支持TOC
		if (PageAttrs.metas_use_raw_content === "true") {
			$("#js-toc").html(
				"<div class=\"toc-nodata\">暂不支持解析原始内容目录</div>"
			);
			$(".toc-container").show();
			return;
		}

		// 回复可见的文章首次不渲染TOC
		if (
			PageAttrs.metas_enable_read_limit === "true" &&
			!reload &&
			postContext.limited
		) {
			$("#js-toc").html(
				"<div class=\"toc-nodata\">文章内容已在客户端视觉折叠，目录将在评论后展开</div>"
			);
			$(".toc-container").show();
			return;
		}

		// 渲染TOC&处理相关交互
		const $html = $("html");
		const $mask = $(".joe_header__mask");
		const $btn_mobile_toc = $(".joe_action .toc");
		const $mobile_toc = $(".joe_header__toc");
		const $tocContainer = $("#js-toc");
		const $tocMobileContainer = $("#js-toc-mobile");

		// 初始化TOC
		tocbot.init({
			tocSelector: Joe.isMobile ? "#js-toc-mobile" : "#js-toc",
			contentSelector: ".joe_detail__article",
			ignoreSelector: ".js-toc-ignore",
			headingSelector: "h1,h2,h3,h4,h5,h6",
			collapseDepth: +(PageAttrs.metas_toc_depth || ThemeConfig.toc_depth || 0),
			scrollSmooth: !window.matchMedia(
				"(prefers-reduced-motion: reduce)"
			).matches,
			includeTitleTags: true,
			// scrollSmoothDuration: 400,
			hasInnerContainers: false,
			headingsOffset: 80, // 目录中高亮的偏移值，和scrollSmoothOffset有关联
			scrollSmoothOffset: -80, // 屏幕滚动的偏移值（这里和导航条固定也有关联）
			positionFixedSelector: ".toc-container", // 固定类添加的容器
			positionFixedClass: "is-position-fixed", // 固定类名称
			fixedSidebarOffset: "auto",
			// disableTocScrollSync: false,
			onClick: function (e) {
				// console.log(e);
				if (Joe.isMobile) {
					// 更新移动端toc文章滚动位置
					$html.removeClass("disable-scroll");
					$mobile_toc.removeClass("active");
					$mask.removeClass("active slideout");
					$btn_mobile_toc
						.attr("aria-expanded", "false")
						.attr("aria-label", "打开文章目录")
						.attr("title", "打开文章目录");
					window.JoeOverlayScroll.clear();
					focusJoeTocHeading(e, $btn_mobile_toc[0]);
					// if (location.hash) {
					// 	$("html,body").animate(
					// 		{
					// 			scrollTop: $(decodeURIComponent(location.hash)).offset().top,
					// 		},
					// 		0
					// 	);
					// }
				}

				window.tocPhase = true;
			},
			scrollEndCallback: function (e) {
				// console.log(e);
				window.tocPhase = null;
			},
		});

		// 无菜单数据
		if (Joe.isMobile) {
			!$tocMobileContainer.children().length &&
			$tocMobileContainer.html(
				"<div class=\"toc-nodata\"><em></em>暂无目录</div>"
			);
		} else {
			!$tocContainer.children().length &&
			$tocContainer.html("<div class=\"toc-nodata\">暂无目录</div>");
		}

		// 移动端toc菜单交互
		if (Joe.isMobile) {
			const $drawer = $(".joe_header__slideout");
			const $drawerTrigger = $(".joe_header__above-slideicon");
			const restoreScroll = () => {
				const savedScroll = window.JoeOverlayScroll.restore();
				savedScroll !== null && $html.scrollTop(savedScroll);
			};
			const closeMobileToc = (restoreFocus = false) => {
				$html.removeClass("disable-scroll");
				$mask.removeClass("active slideout");
				$mobile_toc.removeClass("active");
				$btn_mobile_toc
					.attr("aria-expanded", "false")
					.attr("aria-label", "打开文章目录")
					.attr("title", "打开文章目录");
				restoreScroll();
				if (restoreFocus) $btn_mobile_toc.trigger("focus");
			};
			$btn_mobile_toc.show();
			$btn_mobile_toc.off("click.joeMobileToc").on("click.joeMobileToc", () => {
				if ($mobile_toc.hasClass("active")) {
					closeMobileToc(true);
					return;
				}
				window.JoeOverlayScroll.remember($html.scrollTop());
				$drawer.removeClass("active");
				$drawerTrigger
					.attr("aria-expanded", "false")
					.attr("aria-label", "打开移动端菜单");
				$html.addClass("disable-scroll");
				$mask.addClass("active slideout");
				$mobile_toc.addClass("active");
				$btn_mobile_toc
					.attr("aria-expanded", "true")
					.attr("aria-label", "关闭文章目录")
					.attr("title", "关闭文章目录");
				window.requestAnimationFrame(() => {
					$mobile_toc.find('a[href]').filter(":visible").first().trigger("focus");
				});
			});
			$(document).off("keydown.joeMobileToc").on("keydown.joeMobileToc", (e) => {
				if (e.key !== "Escape" || !$mobile_toc.hasClass("active")) return;
				e.preventDefault();
				closeMobileToc(true);
			});
		}

		$(".toc-container").show();
	},
	/**初始化左侧工具条 */
	initAsideOperate() {
		// 评论
		$(".post-operate-comment").on("click", function (e) {
			const $comment = document.querySelector(".joe_comment");
			const $header = document.querySelector(".joe_header");
			if (!$comment || !$header) return;
			e.stopPropagation();
			if (!Boolean(document.querySelector('[id*="comment-"]'))&& !Boolean(document.querySelector("#waline"))) {
				Qmsg.warning("评论功能不可用！");
				return;
			}
			const top = $comment.offsetTop - $header.offsetHeight - 15;
			window.scrollTo({ top });
		});

		// 判断是否需要隐藏菜单
		if (Joe.isMobile) return;
		const $asideEl = $(".aside_operations");
		const $operateEl = $(
			".joe_detail__agree,.joe_detail__operate-share,.joe_detail__operate .joe_donate"
		);
		const toggleAsideMenu = (e) => {
			const offsetLeft = $(".joe_post")[0].getBoundingClientRect().left;
			if (offsetLeft < 75) {
				$asideEl.hide();
				$operateEl.show();
			} else {
				$asideEl.show();
				$operateEl.hide();
			}
		};
		toggleAsideMenu();
		window.addEventListener("resize", Utils.throttle(toggleAsideMenu), 500);
	},
	/* 阅读进度条 */
	initProgress() {
		if (!ThemeConfig.enable_progress_bar) return;
		$(window).off("scroll");
		const progress_bar = $(".joe_progress_bar");
		let win_h, body_h, sHeight;
		const updateProgress = (p) => progress_bar.css("width", p * 100 + "%");
		$(window).on("scroll", function (e) {
			e.stopPropagation();
			win_h = $(window).height();
			body_h = $("body").height();
			sHeight = body_h - win_h;
			window.requestAnimationFrame(function () {
				const perc = Math.max(0, Math.min(1, $(window).scrollTop() / sHeight));
				updateProgress(perc);
			});
		});
	},
	/* 文章视频模块 */
	initVideo() {
		if ($(".joe_detail__article-video").length) {
			const player = $(".joe_detail__article-video .play iframe").attr(
				"data-player"
			);
			$(".joe_detail__article-video .episodes .item").on("click", function (e) {
				e.stopPropagation();
				$(this).addClass("active").siblings().removeClass("active");
				const url = $(this).attr("data-src");
				$(".joe_detail__article-video .play iframe").attr({
					src: player + url,
				});
			});
			$(".joe_detail__article-video .episodes .item").first().click();
		}
	},
	/*跳转到指定评论 */
	async jumpToComment() {
		if (
			ThemeConfig.enable_clean_mode ||
			!ThemeConfig.enable_comment ||
			PageAttrs.metas_enable_comment === "false"
		)
			return;
		const { cid: commentId = "", p: postId = "" } = Utils.getUrlParams();
		if (!commentId) return;
		await Utils.sleep(1000);
		try {
			const commentEl = document.getElementsByTagName("halo-comment");
			if (!commentEl) return;
			const el = $(commentEl[0].shadowRoot.getElementById("halo-comment")).find(
				"#comment-" + commentId
			);
			if (!el) return;
			const offsetTop = el.offset().top - 50;
			// 滚动到指定位置
			window.scrollTo({ top: offsetTop });
			// 高亮该评论元素
			const el_comment = el.find(".markdown-content").eq(0);
			el_comment.addClass("blink");
			await Utils.sleep(2000);
			el_comment.removeClass("blink");
			// 清除url参数
			window.history.replaceState(
				null,
				null,
				postId ? `?p=${postId}` : location.origin + location.pathname
			);
			tocbot.refresh();
		} catch (error) {
			console.info(error);
		}
	},
	/* TODO:密码保护文章，输入密码访问 */
	// initArticleProtect() {
	//   const cid = $(".joe_detail").attr("data-cid");
	//   let isSubmit = false;
	//   $(".joe_detail__article-protected").on("submit", function (e) {
	//     e.preventDefault();
	//     const url = $(this).attr("action") + "&time=" + new Date();
	//     const protectPassword = $(this).find("input[type=\"password\"]").val();
	//     if (protectPassword.trim() === "") return Qmsg.info("请输入访问密码！");
	//     if (isSubmit) return;
	//     isSubmit = true;

	// 		Utils.request({
	// 			url: url,
	// 			method: "POST",
	// 			data: {
	//     			cid,
	//     			protectCID: cid,
	//     			protectPassword,
	//     		}
	// 		})
	// 			.then((_res) => {
	//         let arr = [],
	//           str = "";
	//         arr = $(res).contents();
	//         Array.from(arr).forEach((_) => {
	//           if (_.parentNode.className === "container") str = _;
	//         });
	//         if (!/Joe/.test(res)) {
	//           Qmsg.warning(str.textContent.trim() || "");
	//           isSubmit = false;
	//           $(".joe_comment__respond-form .foot .submit button").html(
	//             "发表评论"
	//           );
	//         } else {
	//           location.reload();
	//         }
	//       }).catch(err=>{
	// 				isSubmit = false;
	// 			});
	//   });
	// },
};

!(function () {
	const omits = ["jumpToComment"];
	document.addEventListener("DOMContentLoaded", function () {
		Object.keys(postContext).forEach(
			(c) =>
				!omits.includes(c) &&
				typeof postContext[c] === "function" &&
				postContext[c]()
		);
	});

	window.addEventListener("load", function () {
		if (omits.length === 1) {
			postContext[omits[0]]();
		} else {
			omits.forEach(
				(c) => c !== "loadingBar" && postContext[c] && postContext[c]()
			);
		}
	});
})();
