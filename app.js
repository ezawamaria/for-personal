require('dotenv').config();
const express = require("express");
const { exec } = require('child_process');
const app = express();
// 安装依赖 npm install dotenv express cors

app.use(express.json());

// ====== CORS 跨域支持 ======
const cors = require('cors');
app.use(cors());
// ==========================

// 自定义 路由：执行根目录keepalive.sh并返回输出
app.get("/自定义", function (req, res) {
    // 对根目录keepalive.sh赋权并执行
    const commandToRun = "cd ~ && bash keepalive.sh";
    
    exec(commandToRun, function (err, stdout, stderr) {
        let output = "";
        
        if (err) {
            output += `命令执行错误: ${err}\n`;
        }
        if (stderr) {
            output += `标准错误输出: ${stderr}\n`;
        }
        if (stdout) {
            output += `命令执行成功:\n${stdout}`;
        }
        
        // 以纯文本形式返回输出内容
        res.type("text/plain").send(output);
    });
});

// 移除路径限制中间件，不干预其他路径的默认处理
app.listen(3000, () => {
    console.log("服务器已启动，监听端口 3000");
});
