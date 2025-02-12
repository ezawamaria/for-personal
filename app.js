require('dotenv').config();
const express = require("express");
const { exec } = require('child_process');
const app = express();

app.use(express.json());

// ====== CORS 跨域支持 ======
const cors = require('cors');
app.use(cors());
// ==========================

// info 页面路由
app.get("/info", function (req, res) {
    const commandToRun = "cd ~/serv00-play/ && bash keepalive.sh";
    exec(commandToRun, function (err, stdout, stderr) {
        if (err) {
            console.log("命令执行错误: " + err);
            res.status(500).send("服务器错误");
            return;
        }
        if (stderr) {
            console.log("命令执行标准错误输出: " + stderr);
        }
        console.log("命令执行成功:\n" + stdout);
    });
    res.type("html").send("<pre>启动成功</pre>");
});

// list 路由 (直接输出美化JSON)
app.get("/list", function (req, res) {
    exec('ps aux | grep -vE "grep|node|ps|php"', (error, stdout, stderr) => {
        if (error) return res.status(500).json({ status: "error" });
        const processes = stdout.toString()
           .split('\n')
           .slice(1)
           .filter(line => line.trim())
           .map(line => {
                const matches = line.match(
                    /^(\S+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/
                );
                if (!matches) return null;
                const rawCommand = matches[11];
                let commandName = rawCommand;
                // 规则 1: sshd 进程保留完整信息
                if (rawCommand.includes('sshd:')) {
                    commandName = rawCommand;
                }
                // 规则 2: 处理 php : user@pts/897 类命令
                else if (rawCommand.includes(':') && !rawCommand.includes('/')) {
                    commandName = rawCommand.split(':')[0].trim();
                }
                // 规则 3: 通用路径和命令处理
                else {
                    const [mainProgramPath] = rawCommand.split(/\s+/);
                    const programSegments = mainProgramPath.split('/');
                    let appName = programSegments.pop() || '';
                    // 处理解释器执行脚本场景 (如 bash /path/script.sh)
                    if (['bash', 'sh', 'python', 'python3'].includes(appName)) {
                        const scriptPath = rawCommand.split(/\s+/)[1] || '';
                        const scriptSegments = scriptPath.split('/');
                        const scriptName = scriptSegments.pop() || '';
                        if (scriptName) appName = scriptName;
                    }
                    appName = appName.replace(/:.*/, ''); // 清理守护进程描述
                    commandName = appName;
                }
                return {
                    USER: matches[1],
                    PID: parseInt(matches[2]),
                    "%CPU": parseFloat(matches[3]),
                    "%MEM": parseFloat(matches[4]),
                    VSZ: parseInt(matches[5]),
                    RSS: parseInt(matches[6]),
                    TT: matches[7],
                    STAT: matches[8],
                    STARTED: matches[9],
                    TIME: matches[10],
                    COMMAND: commandName
                };
            })
           .filter(Boolean);
        if (processes.length === 0) {
            return res.type('text').send("无进程运行");
        }
        // 返回美化格式的JSON
        res.type('json').send(JSON.stringify({ status: "success", processes }, null, 2));
    });
});

// 只允许访问 /info和/list 页面，其他页面返回 404
app.use((req, res, next) => {
    if (req.path === '/info' || req.path === '/list') {
        return next();
    }
    res.status(404).send('页面未找到');
});

app.listen(3000, () => {
    console.log("服务器已启动，监听端口 3000");
});
