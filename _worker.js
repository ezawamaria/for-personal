export default {
  async fetch(request, env) {
    // 从环境变量中读取，若未设置则使用默认值
    const TOKEN = env.TOKEN || "token"; // 默认 "token"
    const IMG = env.IMG || ""; // 默认为空
    const LIST = env.LIST || ""; // 默认为空
    const NAME = env.NAME || "导航页"; // 默认 "导航页"

    const url = new URL(request.url);

    // 限制访问路径为自定义 TOKEN（无斜杠）
    if (url.pathname !== `/${TOKEN}`) {
      return new Response("404 Not Found", { status: 404 });
    }

    // 获取背景图片
    const backgroundUrl = IMG;

    // 处理 URL 和备注
    const urlList = LIST.split(/[, ]+/).map(entry => {
      const [link, label] = entry.split("#");
      return { link, label: label || link }; // 如果没有备注，显示完整 URL
    });

    // 动态生成导航按钮
    const buttons = urlList
      .map(({ link, label }) => `<button onclick="handleRedirect('${link}')">${label}</button>`)
      .join("");

    const html = `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${NAME}</title> <!-- 使用 NAME 环境变量 -->
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            height: 100vh;
            background-image: url('${backgroundUrl}');
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
          }

          .content-box {
            position: absolute;
            top: 35%; /* 距离顶部 35% */
            left: 50%;
            transform: translate(-50%, -35%);
            background: rgba(255, 255, 255, 0.5); /* 半透明背景 */
            backdrop-filter: blur(10px); /* 高斯模糊 */
            padding: 40px;
            border-radius: 15px;
            text-align: center;
            width: 80%;
            max-width: 600px;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          }

          .content-box:hover {
            transform: translate(-50%, -33%) scale(1.05);
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
          }

          h1, p {
            color: #003366; /* 深蓝色 */
          }

          button {
            display: inline-block;
            margin: 10px 10px;
            padding: 10px 20px;
            font-size: 16px;
            color: white;
            background: rgba(0, 120, 212, 0.8);
            border: none;
            border-radius: 5px;
            cursor: pointer;
          }

          button:hover {
            background: rgba(0, 90, 158, 0.8);
          }
        </style>
        <script>
          function handleRedirect(url) {
            // 在新标签页中打开链接
            window.open(url, '_blank');
          }
        </script>
      </head>
      <body>
        <div class="content-box">
          <h1>${NAME}</h1> <!-- 使用 NAME 环境变量 -->
          <p>点击以下按钮自动跳转到目标页面：</p>
          ${buttons}
        </div>
      </body>
      </html>
    `;

    return new Response(html, {
      headers: { "content-type": "text/html;charset=UTF-8" },
    });
  }
};
