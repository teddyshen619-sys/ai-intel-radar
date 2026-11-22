---
id: lesson-d8e774cab580
order: 5
track: 疑难杂症
title: Antigravity（反重力）登陆难题三板斧
summary: 在开通Gemini会员后苦于无法使用反重力？如何解决问题？
updated_at: 2026-11-22
author_note:
related_tags:
---

## 第一步：Antigravity简介

前面我们已经介绍过 OpenAI 的 Codex，而 Google Antigravity（常称“反重力”）正是谷歌生态里的“Codex”。

但因为 Antigravity 本地权限高、内置算力值钱，谷歌对它的登录风控比普通网页版严格得多。大量新手在登录时都会遇到若干问题，这篇教程就教你手把手地解决可能遇到的问题。

**特别注意！！！在此教程开始时务必把系统自带的浏览器换成谷歌浏览器，然后在谷歌浏览器登陆好你需要使用反重力的账户，否则会有一些麻烦**

## 问题1:网络代理问题

第一个会遇到的报错是网络问题的报错

![操作截图](guides-media/lesson-d8e774cab580/163aeed0f976d8ce74fc1016219a0db44562ef13a3e9513e2da107390789ed4f.jpg)


原因是什么呢？

代理默认处于「智能 」分流模式：大部分网络代理软件在初始设置下都是「智能模式」（或称「规则模式 / Rule」），只把常见的国外网页自动切为海外 IP，没识别到的地址则正常走国内网络直连。而 Antigravity 在后台向谷歌服务器交换登录令牌时，部分请求 IP 没有被代理的初始规则库命中，结果直接走了本地网络直连，导致撞墙超时。


解决这个问题有两个比较简单的方法

**方法一**

打开你的网络代理软件，在主界面找到当前的连接路由模式（初始默认一般勾选在「智能模式」或「自动分流」）。

![以我的软件为例](guides-media/lesson-d8e774cab580/5f582b81e552e2e8bd8f06fd8dddec03b550f44fe329a9d147b0e4137be03488.png)

手动将其切换为 「全局模式」（部分软件名称为「安全模式」或「全局路由」，即让电脑所有流量无差别走海外 IP），
并打开TUN代理模式。

节点地区核验要点：检查当前连接的国家/地区，务必避开中国香港（HK）节点（Google 对香港 IP 锁区限制极严，极易导致后续拒登），优先选择 美国（US）、新加坡（SG）或日本（JP） 节点。

**但这个方法有一个弊端，在使用反重力时如果想要使用国内的相关软件或打开国内网址，很大概率是打不开的，比较麻烦。所以我们介绍方法二**

**方法二：借助本地 Agent + GitHub 开源项目，单独为 Antigravity 绑定代理端口（推荐）**

步骤 1：确认网络代理已开启（保持默认的模式即可）

打开你的代理软件，确保已正常连接海外节点（同样注意避开香港节点，优先选美国、新加坡或日本）。

步骤 2：打开本地 Agent 客户端

启动你电脑上已经装好的 ChatGPT 桌面端（Codex），或者国内的workbuddy等具备本地文件与终端操作权限的 Agent 工具。

步骤 3：发送一键配置指令，让 Agent 自动拉取开源方案修复

将下面这段整理好的提示词直接复制，粘贴发送给你的本地 Agent，Agent最好选择完全访问模式（或类似表述）

![操作截图](guides-media/lesson-d8e774cab580/398049adb63a3a7f1967490f55dca064f0f869ddc7ea9ae610751696ae468218.png)

```text
我现在遇到一个问题，我的 Antigravity 登录遇到了问题，我是使用网络代理登录的。直接给 Antigravity 设置独立的网络端口可以避免一系列麻烦的操作，在代理的“规则模式”下就可以正常用上 Antigravity。请你检索并参考这个 GitHub 开源教程：https://github.com/xiaobaijiadepugongyingpai-coder/antigravity-proxy-fix ，自动检测我本机的代理端口，帮我在本地完成配置并解决这个问题。
```

**兜底策略**
如果本地 Agent 提示网络超时读取不到该 GitHub 网页，只需在你挂好代理的浏览器中手动打开项目地址 [https://github.com/xiaobaijiadepugongyingpai-coder/antigravity-proxy-fix](https://github.com/xiaobaijiadepugongyingpai-coder/antigravity-proxy-fix)，点击页面右上角绿色的「Code」按钮并选择「Download ZIP」把压缩包下载到电脑再发送给本地 Agent 直接读取你刚解压的文件夹按上文提示词说明要求即可。

![操作截图](guides-media/lesson-d8e774cab580/14f69b59fd7f26078b54d0901c151cb1d873cbd0d81878acbcb0344f1247975b.png)


按照方法一或方法二，你就会发现这个报错已经被解决啦

## 问题2：账号所在地区不支持访问的问题

很多朋友按上面的方法修好网络超时后，切回客户端直接提示 

「当前账号所在地区不支持访问（Not available in your country）」或 Your current account is not eligible

**为什么挂了美国 / 新加坡等海外节点，还是提示地区不支持？**

这里有一个非常反直觉的核心机制：Google 判断你能不能用 Antigravity，不仅看你此刻连接的代理 IP 在哪，更看重 Google 后台给你账号打上的「关联国家 / 地区（Country Association）」归属地标签！

如果你的 Google 账号注册较早，或者平时经常在国内直连下使用，账号后台的归属地标签很可能已经被系统判定为「中国大陆（China）」。只要这个后台标签没改过来，哪怕你现在挂着美国 IP，也会在登录资格校验环节被卡。

**完整排查与解决步骤：**


**1.打开谷歌官方服务条款页：**
[https://policies.google.com/terms](https://policies.google.com/terms)

![操作截图](guides-media/lesson-d8e774cab580/29cdb441c23683c97ceac74e62b9e9f5a9aba53a4f836eb500e92150b506175c.png)

有两种情况

a. 如果已经显示为美国、日本、新加坡等支持地区：说明账号归属地没问题。此时被拦通常有两个小原因：一是你刚才不小心用过不稳定节点导致本地残留了受限缓存（切回和显示地区一致的较纯净节点后彻底退出客户端重登即可）；二是去 Google 账号的「个人信息 → 生日」里检查一下，确保账号年龄已满 18 周岁（未成年设置会被资格检查直接拦截）。

b.如果显示为「中国（China）」或「中国香港（Hong Kong）」：说明账号被锁区了，请继续按下面第 2 步申请改区。

**2. 提交官方「账号关联国家 / 地区」修改申请**

先对齐代理 IP：将你的代理节点固定切换到你最常用的IP属地，比如我的就是新加坡。

打开官方改区申请入口：在浏览器访问 Google 国家/地区关联更改表单：[https://policies.google.com/country-association-form](https://policies.google.com/country-association-form)

填写目标地区与原因：

您希望将账号关联到哪个地区？：选择与你当前代理节点完全一致的国家（且与你当前使用代理IP一致）。

变更原因：其他原因

Due to recent work requirements, I need to complete my related work in（        ）[填你想要修改的国家英文名]. Therefore, I would like to request to change my account's associated region to this area. I hope to get your approval. Thank you very much!

最后等待邮件审核通过后即可重登：点击提交后，Google 会发邮件通知审核结果（快则半小时到几小时，慢则需数天）。收到修改成功的确认邮件后，回到 反重力 客户端点击退出登录（或点击 Continue with different account），重新走一遍网页授权即可解决该问题！

## 问题3：账号触发强制扫码验证

顺利解决网络连通和地区限制后，很多新手在最后一步验证身份时还会撞上最头疼的风控拦截：Google 弹出强制扫码验证，要求用手机跨设备扫码，但国内环境下往往扫不出来或扫完直接卡死，页面还不给其他跳过选项。下面我会教大家把扫码验证转变为普通的验证码验证。

一、 前置准备：在 Chrome 中安装降级辅助插件
下载开源插件压缩包（注意：访问 GitHub 时请保持网络代理开启）

前往目标网站

[github.com/havenicec/google-qr-sms-helper](https://github.com/havenicec/google-qr-sms-helper)

![操作截图](guides-media/lesson-d8e774cab580/33267627bb1e25f257fdf7e94d9dedaecc2730d3879d7df2bed8ec216ce563e0.png)

打开上方项目主页，点击页面右上角绿色的 「Code」 按钮，选择 「Download ZIP」 下载到本地并解压成一个普通文件夹。

 加载到 Chrome 浏览器
打开 Google Chrome 浏览器，在地址栏输入 chrome://extensions/ 并回车进入扩展管理页：

打开页面右上角的 「开发者模式」 开关；

点击左上角出现的 「加载已解压的扩展程序」，选中刚才解压出来的插件文件夹即可完成安装（插件名称显示为 Google 验证码辅助）。

![操作截图](guides-media/lesson-d8e774cab580/850a9fb48c79c2b48e7373d1276e9dc95bb3336e2d4429da060764f9a7fd0ce5.png)

二：通过 Cloud Shell 触发短信降级并解锁账号

我们为什么要这么做呢？因为这里的验证和反重力的是同一个，且可以通过插件改成验证码验证。

打开 Google Cloud 控制台启动终端
在刚装好插件的 Chrome 浏览器中确保已登录受限的 Google 账号，访问 Google Cloud 控制台：

https://console.cloud.google.com/

进入页面后（右下角会出现蓝色的插件步骤提示框），点击网页右上角顶栏的 >_ 终端图标（Activate Cloud Shell）。

![操作截图](guides-media/lesson-d8e774cab580/487b8bef3b4c731e7e64acf8857414d7534ba0e8ca594fb4a987665a4562e7be.png)

同意条款并进入身份验证

等待页面底部弹出 Cloud Shell 初始化窗口，勾选服务条款复选框，点击 Start Cloud Shell。

页面中央弹出 Verify your account（验证您的账号）提示框，点击蓝色的 Verify 按钮。


选择手机号短信验证（绕开强制扫码）
页面跳转至验证方式选择页（Choose a way to verify）。此时避开第一项扫码，直接点击第二项 Verify your phone number（使用手机验证码）。

与前面注册 OpenAI / Codex 不同，Google 这里的短信验证列表原生支持中国大陆（China +86）号码（如果你在注册谷歌账号的时候就已经用过手机号验证了，这里有可能会强制你使用那一个号码，如果发生这种情况，尝试找到那个号码）

所以如果你的电话号码之前没注册过太多别的账户，你可以直接输入自己的电话号码，然后填写发来的验证码完成验证。（都尝试一下，很有机会成功），如果不行再用身边家人朋友的手机号试试，用真实还能经常接收二维码的号码是最好的。

如果实在找不到有可用号码，也可以切到接码平台获取号码
可沿用前面介绍的海外接码平台（小号可以这么干，大号我实在不建议）

https://hero-sms.com/

如果出现一个号码迟迟收不到验证码的情况，节省时间可以点立刻释放号码然后换一个新的，接码成本特别特别低。

最后填入验证码完成账号解锁
复制收到的 6 位纯数字验证码，等待几秒钟自动跳转回 Google 账户主页（Account Home），即代表账号风控已彻底解除！

账号解锁后切回 Antigravity 客户端登录，之前显示的扫码环节就没有了，直接就可以登陆进去了。

## 总结

到这里三个最主流的问题就全解决了！大家就可以开始使用反重力了，如果还有登陆上的问题可以注册站内号，通过私信或是在主页界面底部的“联系我们”一栏给我发邮件咨询。后续我会介绍一些低价正规开通Gemini订阅的方式，请大家持续关注！如果我真的有帮助到大家，希望大家能多多转发我们的网站！
