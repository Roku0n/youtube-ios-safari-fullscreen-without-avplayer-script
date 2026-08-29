中文 | [English](README.en.md)

# YouTube iPhone iOS Safari 伪全屏/铺满(Userscript)

一个给 iPhone iOS Safari 用的 Userscript:点击 YouTube 移动网页版(`m.youtube.com`)视频的全屏按钮时,让播放器铺满整个屏幕,但**不触发 iOS 系统原生的全屏播放器**——播放器控件(播放/暂停、进度条、时间、设置等)仍然是网页 DOM 里的普通元素,继续参与页面渲染。

## 为什么要这么做

iPhone iOS Safari 上,`<video>` 元素触发系统原生全屏后,画面会交给系统播放器渲染,网页 DOM 里的任何覆盖层(包括字幕、翻译层等自定义 UI)都无法再显示在视频上方。这个脚本通过拦截全屏请求、改用 CSS 手动铺满播放器容器的方式,避免了这个限制。

## 效果

- 播放器容器铺满整个可视视口(跟随 `visualViewport` 实时适配 Safari 工具栏收起/展开的动画过程)
- 进度条与底部控制条(时间显示、全屏恢复按钮)一起上移,避开 iPhone Home 指示条的手势触控区,不影响拖动进度条
- 内置一个不依赖浏览器控制台的调试面板(点击左上角 `▣` 按钮查看)

## 安装

1. 在 iOS 上安装 [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) App 和对应的 Safari 扩展
2. 打开 Userscripts App,设置好脚本保存目录(可以用 iCloud Drive 文件夹方便跨设备同步)
3. 把 `youtube-ios-fullscreen.user.js` 保存到这个目录里
4. 在 Safari 的扩展设置里启用 Userscripts,并对 `m.youtube.com` 授权注入
5. 打开 `m.youtube.com` 上的任意视频,点击全屏按钮测试

## 已知限制

- **仅支持 iPhone 上的 iOS Safari**。没有在 iPad 上测试过——iPadOS 上 `Element.requestFullscreen()`(任意元素全屏)是受支持的,跟 iPhone 的情况不一样,这个脚本的绕过逻辑很可能不适用,也没有必要。也没有在其他 iOS 浏览器(Chrome for iOS 等,底层仍是 WebKit)上测试过。
- **点赞/点踩/收藏按钮、"下一个视频"推荐卡片**(安卓版全屏时左右下角常驻的那两组 UI)目前做不出来。这两块 UI(YouTube 内部称为 `fullscreenEngagementOverlayRenderer` / `playerOverlayAutoplayRenderer`)只在浏览器**真正**进入 `document.fullscreenElement` 状态时才会被 YouTube 自己的播放器 JS 动态创建,退出全屏就会被销毁。而这个脚本为了避免系统原生播放器接管画面,一开始就拦截了真实的 `requestFullscreen()` 调用,导致 YouTube 自己的全屏处理逻辑(包括这两个浮层的创建)根本没有执行的机会。伪造 `fullscreenElement` 相关属性并派发 `fullscreenchange` 事件也无法在事后补触发这段创建逻辑。
- 仅在 `m.youtube.com`(移动网页版)上测试过;YouTube 前端会不定期改版,选择器/class 名可能随时间失效,需要重新适配。

## 版本

当前版本 1.0,是第一个对外发布的版本。

## License

MIT,见 [LICENSE](LICENSE)。
