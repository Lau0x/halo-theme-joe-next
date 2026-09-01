/**文章页逻辑 */
function shouldExpandJournalBlock(block, threshold) {
	const height = Math.max(
		Number(block.scrollHeight) || 0,
		Number(block.getBoundingClientRect().height) || 0
	);
	return height >= threshold;
}

const journalContext = {
	/* 激活列表特效 */
	initEffect() {
		$(".joe_loading").remove();
		$(".joe_journals__list").removeClass("hidden");
		if (!ThemeConfig.enable_journal_effect) return;
		new WOW({
			boxClass: "wow",
			animateClass: ThemeConfig.journal_list_effect_class || "fadeIn",
			offset: 0,
			mobile: true,
			live: true,
		}).init();
	},

	/* 日志发布时间格式化 */
	formatTime() {
		const $allJournalTime = $(".joe_journal-posttime");
		$allJournalTime.each(function () {
			const $this = $(this);
			$this.html(Utils.timeAgo($this.text()));
		});
	},
	/* 点赞 */
	initLike() {
		if (!ThemeConfig.enable_like_journal) return;
		const $allItems = $(".joe_journal__item");
		if ($allItems.length) {
			$allItems.each(function () {
				const $this = $(this);
				const cid = $this.attr("data-cid");
				const clikes = +($this.attr("data-clikes") || 0);
				let likeCount = clikes;
				let agreeArr = localStorage.getItem(encryption("agree-journal"))
					? JSON.parse(
						decrypt(localStorage.getItem(encryption("agree-journal")))
					)
					: [];
				let flag = agreeArr.includes(cid);
				const $iconLike = $this.find(".journal-like");
				const $iconUnlike = $this.find(".journal-unlike");
				const $likeNum = $this.find(".journal-likes-num");
				const $likeButton = $this.find(".joe_journal_operate_item.like");
				const syncLikeControl = (pressed) => {
					const label = pressed
						? `已点赞，当前 ${likeCount} 次点赞`
						: `点赞，当前 ${likeCount} 次点赞`;
					$likeButton
						.attr("aria-pressed", String(pressed))
						.attr("aria-label", label)
						.attr("title", label)
						.prop("disabled", pressed);
				};
				if (flag) {
					$iconLike.hide();
					$iconUnlike.show();
				} else {
					$iconLike.show();
					$iconUnlike.hide();
				}
				$likeNum.html(clikes);
				syncLikeControl(flag);
				let _loading = false;
				$likeButton.on("click", function (e) {
					e.stopPropagation();
					if (_loading || flag) return;
					_loading = true;
					$likeButton.prop("disabled", true).attr("aria-busy", "true");
					agreeArr = localStorage.getItem(encryption("agree-journal"))
						? JSON.parse(
							decrypt(localStorage.getItem(encryption("agree-journal")))
						)
						: [];
					flag = agreeArr.includes(cid);
					if (flag) {
						_loading = false;
						$likeButton.attr("aria-busy", "false");
						syncLikeControl(true);
						return;
					}

					$.ajax({
						url: "/apis/api.halo.run/v1alpha1/trackers/upvote",
						type: "post",
						contentType: "application/json; charset=utf-8",
						data: JSON.stringify({
							group: "moment.halo.run",
							plural: "moments",
							name: cid,
						}),
					})
						.then((_res) => {
							likeCount++;
							agreeArr = localStorage.getItem(encryption("agree-journal"))
								? JSON.parse(
										decrypt(localStorage.getItem(encryption("agree-journal")))
									)
								: [];
							if (!agreeArr.includes(cid)) agreeArr.push(cid);
							$iconLike.hide();
							$iconUnlike.show();
							flag = true;
							const name = encryption("agree-journal");
							const val = encryption(JSON.stringify(agreeArr));
							localStorage.setItem(name, val);
							$likeNum.html(likeCount);
							syncLikeControl(flag);
							_loading = false;
							$likeButton.attr("aria-busy", "false");
						})
						.catch(() => {
							_loading = false;
							$likeButton.prop("disabled", false).attr("aria-busy", "false");
						});
				});
			});
		}
	},
	/* 评论及折叠 */
	initComment() {
		if (ThemeConfig.enable_clean_mode || !ThemeConfig.enable_comment_journal)
			return;
		$(".journal_comment_expander,.joe_journal_operate_item.comment").on("click", function (e) {
			e.stopPropagation();
			const $this = $(this);
			const $parent = $this.parents(".footer-wrap");
			// const compComment = $parent.find("halo-comment")[0]._wrapper.$refs.inner;
			// 展开加载评论
			// if (!$parent.hasClass("open")) {
			// 	return;
			// }
			$parent.toggleClass("open");
			const isOpen = $parent.hasClass("open");
			const label = isOpen ? "收起评论" : "查看评论";
			$parent.find(".journal_comment_expander_txt").html(label);
			$parent
				.find(".journal_comment_expander,.joe_journal_operate_item.comment")
				.attr("aria-expanded", String(isOpen))
				.attr("aria-label", label)
				.attr("title", label);
		});
	},
	/* 内容折叠/展开 */
	initExpander() {
		$(".journal_content_expander").on("click", function (e) {
			e.stopPropagation();
			const $button = $(this);
			const $body = $button.parents(".joe_journal_body");
			$body.toggleClass("open");
			const isOpen = $body.hasClass("open");
			const label = isOpen ? "收起动态内容" : "展开动态内容";
			$button
				.attr("aria-expanded", String(isOpen))
				.attr("aria-label", label)
				.attr("title", label);
		});
	},
	/* 日志块折叠 */
	foldBlock() {
		const $allBlocks = $(".joe_journal_body .content-wrp");
		const configuredThreshold = Number(ThemeConfig.journal_block_height);
		const threshold = Number.isFinite(configuredThreshold) ? configuredThreshold : 300;
		$allBlocks.each(function () {
			const block = this;
			const $block = $(block);
			const $expander = $block.siblings(".journal_content_expander");
			const update = () => {
				$expander.toggle(shouldExpandJournalBlock(block, threshold));
			};
			$block
				.find("img")
				.off(".joeJournalFold")
				.on("load.joeJournalFold error.joeJournalFold", update);
			if (!block.__joeJournalFoldObserver && "ResizeObserver" in window) {
				block.__joeJournalFoldObserver = new ResizeObserver(update);
				block.__joeJournalFoldObserver.observe(block);
			}
			update();
		});
	},
};

!(function () {
	const omits = ["foldBlock"];
	document.addEventListener("DOMContentLoaded", function () {
		Object.keys(journalContext).forEach(
			(c) => !omits.includes(c) && journalContext[c]()
		);
	});
	window.addEventListener("load", function () {
		journalContext.foldBlock();
	});
})();
