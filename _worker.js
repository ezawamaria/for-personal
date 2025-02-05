export default {
  async fetch(request, env) {
      // 解析请求的 URL 和路径
      const url = new URL(request.url);
      const path = url.pathname.split("/").filter(Boolean);
      const token = env.TOKEN || "token";  // 获取 TOKEN（用于限制路径）
      const LISTKV = env.LISTKV;  // 配置存储 KV 命名空间 - 监控列表
      const INFOKV = env.INFOKV;  // 配置存储 KV 命名空间 - 服务信息
      const name = env.NAME || "服务监控系统";  //设置站点标题
      const img = env.IMG || "";  //背景图片地址 

      // 统一处理 KV 写入重试，确保数据持久化
      const putWithRetry = async (namespace, key, value) => {
          const MAX_ATTEMPTS = 3;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
              try {
                  await namespace.put(key, value);  // 写入数据到 KV
                  const saved = await namespace.get(key);  // 校验写入是否成功
                  if (saved === value) return true;
                  if (attempt === MAX_ATTEMPTS) throw new Error("KV验证失败");
              } catch (error) {
                  // 写入失败时进行重试
                  if (attempt === MAX_ATTEMPTS) throw error;
                  await new Promise(r => setTimeout(r, 200 * attempt)); // 延迟重试
              }
          }
      };

      // 编辑配置页面，处理 POST 请求
      if (path.length === 2 && path[0] === token && path[1] === "edit" && request.method === "POST") {
          try {
              const rawContent = await request.text();  // 获取 POST 请求的文本内容
              const separatorIndex = rawContent.indexOf('###');  // 配置块的分隔符

              // 确保配置内容有效且包含分隔符
              if (separatorIndex <= 0 || separatorIndex >= rawContent.length - 1) {
                  throw new Error("必须包含两个有效配置块，用 ### 分隔");
              }

              // 提取两个配置块
              const newList = rawContent.substring(0, separatorIndex).trim();
              const newInfo = rawContent.substring(separatorIndex + 3).trim();

              // 将新配置存入 KV，并返回响应
              await Promise.all([
                  putWithRetry(LISTKV, "listadd", newList),
                  putWithRetry(INFOKV, "infoadd", newInfo)
              ]);

              return new Response(JSON.stringify({
                  status: "success",
                  message: `保存成功（${newList.length + newInfo.length}字节）`
              }), {
                  headers: { "Content-Type": "application/json" }
              });

          } catch (error) {
              // 错误处理，记录错误并返回错误信息
              console.error(`保存失败: ${error.stack}`);
              return new Response(JSON.stringify({
                  status: "error",
                  message: error.message.replace(/[\r\n]/g, " "),
                  code: "KV_WRITE_FAIL"
              }), { status: 500 });
          }
      }

      // 校验 KV 是否正确绑定
      const validateKV = (kv) => {
          if (!kv || typeof kv.put !== "function")
              throw new Error("KV 命名空间未正确绑定");
      };

      try {
          // 校验命名空间是否存在
          validateKV(LISTKV);
          validateKV(INFOKV);

          // 获取并返回看板内容
          if (path.length === 1 && path[0] === token) {
              const [list, info] = await Promise.all([
                  LISTKV.get("listadd") || "",
                  INFOKV.get("infoadd") || ""
              ]);

              // 生成按钮的 HTML 代码
              const generateButtons = (data, panelType) => {
                  return data.split(/[, \n]+/)  // 根据逗号或换行符分割配置项
                     .filter(entry => entry.trim())
                     .map(entry => {
                          const [link, label] = entry.split("#");  // 分割链接和标签
                          return `
              <button class="api-btn ${panelType}-btn" 
                onclick="handleClick('${link.trim()}', '${panelType}')"
                title="${link.trim()}">
                ${(label || link).trim()}
              </button>
            `;
                      }).join("");
              };

              // 生成完整的 HTML 看板
              const html = `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${name}</title>
          <style>
            :root {
              --process-color: #4CAF50;
              --service-color: #2196F3;
              --glass-opacity: 0.8;
            }
            body {
              margin: 0;
              min-height: 100vh;
              font-family: 'Segoe UI', system-ui, sans-serif;
              background: url('${img}') center/cover fixed;
              background-size: cover;
              background-position: center;
            }
          .dashboard {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 30px;
              max-width: 1400px;
              margin: 0 auto;
              padding: 80px 20px 20px;
            }
          .panel {
              background: rgba(255,255,255,var(--glass-opacity));
              border-radius: 8px;
              padding: 20px;
              box-shadow: 0 4px 16px rgba(0,0,0,0.1);
              width: 100%;
              box-sizing: border-box;
            }
          .panel-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 20px;
            }
          .panel-title {
              margin: 0;
              font-size: 1.5rem;
              color: #2c3e50;
            }
          .btn-group {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
              gap: 10px;
              margin-bottom: 20px;
            }
          .api-btn {
              padding: 12px;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              transition: all 0.2s;
              font-size: 0.9rem;
              text-align: center;
              color: white;
            }
          .process-btn {
              background: var(--process-color);
            }
          .service-btn {
              background: var(--service-color);
            }
          .api-btn:hover {
              opacity: 0.9;
              transform: translateY(-1px);
            }
          .start-all-btn {
              padding: 8px 16px;
              background: #2196F3;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 0.9rem;
            }
          .result-box {
              padding: 15px;
              background: rgba(255,255,255,0.9);
              border-radius: 6px;
              min-height: 200px;
              font-family: monospace;
              white-space: pre-wrap;
              overflow-wrap: break-word;
              word-break: break-all;
              overflow-y: auto;
              max-height: 400px;
              width: 100%;
              box-sizing: border-box;
            }
          .timestamp {
              color: #666;
              font-size: 0.8rem;
              margin-bottom: 5px;
            }
          .edit-btn {
              position: fixed;
              top: 25px;
              right: 25px;
              padding: 12px 30px;
              background: #2196F3;
              color: white;
              border: none;
              border-radius: 10px;
              cursor: pointer;
              font-size: 1.1rem;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
          @media (max-width: 768px) {
            .dashboard {
              grid-template-columns: 1fr;
              padding: 60px 10px 10px;
            }
            .result-box {
              font-size: 0.9em;
            }
          }
        </style>
        <script>
          function handleClick(url, panelType) {
            const container = document.getElementById(panelType + '-result');
            const timestamp = '<div class="timestamp">' + new Date().toLocaleString() + '</div>';
            const loadingMsg = '<div class="loading">⏳ 请求中...</div>';
            container.innerHTML += timestamp + loadingMsg;
            fetch(url)
             .then(response => {
                if (!response.ok) throw new Error('HTTP'+ response.status);
                return response.text();
              })
             .then(data => {
                try {
                  const jsonData = JSON.parse(data);
                  if (jsonData.status === "success" && jsonData.processes) {
                    let formattedData = "进程查询成功\\n";
                    const user = jsonData.processes[0].USER;
                    formattedData += "[用户：" + user + "]\\n";
                    jsonData.processes.forEach(process => {
                      const { PID, STARTED, TIME, COMMAND } = process;
                      formattedData += JSON.stringify({ "PID": PID, "STARTED": STARTED, "TIME": TIME, "进程名": COMMAND }) + ",\\n";
                    });
                    formattedData = formattedData.slice(0, -2);
                    container.lastElementChild.innerHTML = '<pre style="white-space: pre-wrap;">' + formattedData + '</pre>';
                  } else {
                    container.lastElementChild.innerHTML = '<pre style="white-space: pre-wrap;">' + data + '</pre>';
                  }
                } catch (parseError) {
                  container.lastElementChild.innerHTML = '<pre style="white-space: pre-wrap;">' + data + '</pre>';
                }
              })
             .catch(error => {
                const errorMsg = '<div class="error">❌ 请求失败:'+ error.message + '</div>';
                container.lastElementChild.innerHTML = errorMsg;
              });
          }
          async function startAllServices() {
            const buttons = document.querySelectorAll('.service-btn');
            for (const btn of buttons) {
              btn.click();
              await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 500));  //启动全部按钮延迟设定
            }
          }
          async function viewAllProcesses() {
            const buttons = document.querySelectorAll('.process-btn');
            for (const btn of buttons) {
              btn.click();
              await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 500));  //查看所有按钮延迟设定
            }
          }
        </script>
      </head>
      <body>
        <button class="edit-btn" onclick="location.href='/${token}/edit'">⚙️ 配置管理</button>
        <div class="dashboard">
          <div class="panel">
            <div class="panel-header">
              <h2 class="panel-title">进程监控</h2>
              <button class="start-all-btn" onclick="viewAllProcesses()">查看所有</button>
            </div>
            <div class="btn-group">
              ${generateButtons(list, 'process')}
            </div>
            <div class="result-box" id="process-result"></div>
          </div>

          <div class="panel">
            <div class="panel-header">
              <h2 class="panel-title">服务管理</h2>
              <button class="start-all-btn" onclick="startAllServices()">启动全部</button>
            </div>
            <div class="btn-group">
              ${generateButtons(info,'service')}
            </div>
            <div class="result-box" id="service-result"></div>
          </div>
        </div>
      </body>
      </html>
    `;
              return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
          }

          // 配置管理页面的逻辑
          if (path.length === 2 && path[0] === token && path[1] === "edit") {
              const [list, info] = await Promise.all([
                  LISTKV.get("listadd") || "",
                  INFOKV.get("infoadd") || ""
              ]);
              const html = `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>配置管理</title>
          <style>
            :root {
              --primary-color: #2196F3;
            }
            body {
              margin: 0;
              min-height: 100vh;
              font-family: 'Segoe UI', system-ui, sans-serif;
              background: url('${img}') center/cover fixed;
              background-size: cover;
              padding: 20px;
            }
          .edit-container {
              max-width: 1200px;
              margin: 0 auto;
              background: rgba(255,255,255,0.95);
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            }
          #message {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 20px;
            border-radius: 6px;
            background: rgba(0,0,0,0.8);
            color: white;
            max-width: 400px;
            transition: opacity 0.3s;
            display: none;
          }
          .editor-group {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 30px;
              margin-bottom: 30px;
            }
          textarea {
            width: 100%;
            height: 400px;
            padding: 15px;
            border: 2px solid var(--primary-color);
            border-radius: 8px;
            font-family: monospace;
            resize: vertical;
            background: rgba(255,255,255,0.9);
          }
          .button-group {
              display: flex;
              gap: 20px;
              justify-content: center;
            }
          .save-btn {
              padding: 12px 40px;
              background: var(--primary-color);
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            }

          .back-btn {
              padding: 12px 40px;
              background: #4CAF50;
              color: white;
              border-radius: 6px;
              text-decoration: none;
            }
          @media (max-width: 768px) {
            .editor-group {
              grid-template-columns: 1fr;
            }
            textarea {
              height: 300px;
            }
          }
        </style>
      </head>
      <body>
        <div id="message"></div>
        <div class="edit-container">
          <h1>配置管理中心</h1>
          <div class="editor-group">
            <div>
              <h2>监控端点配置 (LIST)</h2>
              <textarea id="list">${list}</textarea>
            </div>
            <div>
              <h2>服务配置 (INFO)</h2>
              <textarea id="info">${info}</textarea>
            </div>
          </div>
          <div class="button-group">
            <button class="save-btn" onclick="saveConfig()">💾 保存配置</button>
            <a href="/${token}" class="back-btn">📊 返回看板</a>
          </div>
        </div>
        <script>
          const message = document.getElementById('message');
          async function saveConfig() {
            const listVal = document.getElementById("list").value;
            const infoVal = document.getElementById("info").value;
            message.style.display = 'block';
            message.textContent = '正在保存配置...';
            message.style.backgroundColor = '#2196F3';
            try {
              const response = await fetch(window.location.pathname, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: listVal + '###' + infoVal
              });
              if (!response.ok) {
                const error = await response.text();
                throw new Error(error);
              }
              message.textContent = '配置保存成功！';
              message.style.backgroundColor = '#4CAF50';
              setTimeout(() => message.style.display = 'none', 2000);
            } catch (error) {
              message.textContent = '保存失败:'+ error.message;
              message.style.backgroundColor = '#f44336';
              setTimeout(() => message.style.display = 'none', 3000);
            }
          }
        </script>
      </body>
      </html>
    `;
              return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
          }
         // 如果未匹配任何路径，则返回 404
          return new Response("404 Not Found", { status: 404 });

    } catch (error) {
      // 捕获和记录处理错误
      console.error(`处理失败: ${error.stack}`);
      return new Response(JSON.stringify({
        status: "error",
        message: error.message,
        code: "SYSTEM_ERROR"
      }), { status: 500 });
    }
  }
};
