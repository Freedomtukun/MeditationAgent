# Feedback‑Agent 云函数

自适应瑜伽评分语音反馈。

## 部署步骤
1. **克隆 & 安装依赖**
```bash
pnpm i --prod
```
2. **环境变量**（云函数 → 配置）
```
HUNYUAN_API_KEY=hy‑***
TENCENTCLOUD_SECRETID=AKID***
TENCENTCLOUD_SECRETKEY=***
COS_BUCKET=yogasmart-static-1351554677
```
3. **COS 缓存桶**
- 创建 Standard 存储桶 `${COS_BUCKET}`，地域 ap‑shanghai
- 目录 `tts-cache/` 公共读，私有写
- CORS 允许 `GET,HEAD`
4. **部署**
```bash
npm run deploy:tcb
```
5. **小程序调用示例**
```js
wx.cloud.callFunction({
  name:'feedback-agent',
  data:{ pose_name:'tree_pose', score:78, error_points:['左膝角度不足'] }
}).then(res=>{
  const { audioUrl } = res.result;
  const audio = wx.createInnerAudioContext();
  audio.src = audioUrl;
  audio.play();
});
```

> **安全提醒** 创建新密钥后，请立即在访问管理中禁用旧 SecretKey。
