/**归档页逻辑 */
const archivesContext = {
	/* 内容折叠/展开 */
	initExpander() {
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)"
		).matches;
		$(".joe_archives-timelist .wrapper").css(
			"transition-duration",
			prefersReducedMotion ? "0s" : ""
		);
		$(".joe_archives-timelist .panel").on("click", function (e) {
			e.stopPropagation();
			const $this = $(this);
			const $titleHeight = $this.outerHeight();
			const $panelBody = $this.next(".panel-body");
			const $wrapper = $this.parent();
			if ($this.hasClass("in")) {
				$this.removeClass("in").attr("aria-expanded", "false");
				if ($panelBody[0].contains(document.activeElement)) {
					$this[0].focus();
				}
				$panelBody.attr("aria-hidden", "true").attr("inert", "");
				$wrapper.height($titleHeight + "px");
			} else {
				$panelBody.removeAttr("inert").removeAttr("aria-hidden");
				const $conHeight = $panelBody.outerHeight();
				$this.addClass("in").attr("aria-expanded", "true");
				$wrapper.height(`${$titleHeight + $conHeight}px`);
			}
		});
	},
};
document.addEventListener("DOMContentLoaded", function () {
	archivesContext.initExpander();
});
