# SSH 远程控制教程（给子 Agent / 自动化使用）

本文说明如何从当前开发机远程操作另一台 Mac 上的项目。当前设备都在同一手机热点局域网内。

## 1. 当前已知环境

| 项目 | 值 |
|---|---|
| 本地开发机 | `172.20.10.11` |
| 远程 Mac | `172.20.10.12` |
| 远程主机名 | `huaningdeMacBook-Air.local` |
| 远程用户名 | `huaning` |
| SSH 别名 | `huaning-mac` |
| 远程项目目录 | `/Users/huaning/work/tech_bit` |
| 游戏中心 | `http://172.20.10.12:8100/games/index.html` |

SSH 别名配置在本机 `~/.ssh/config` 中，大致等价于：

```sshconfig
Host huaning-mac
  HostName 172.20.10.12
  User huaning
  IdentityFile ~/.ssh/id_ed25519
```

> 注意：热点重新连接后，IP 理论上可能变化。执行远程操作前，先按下面方法检查连通性。

## 2. 先检查能不能连接

推荐每次自动化操作前先执行：

```bash
ssh -o BatchMode=yes -o ConnectTimeout=5 huaning-mac '
  echo SSH_OK
  whoami
  hostname
  pwd
  ipconfig getifaddr en0
'
```

如果成功，会输出类似：

```text
SSH_OK
huaning
huaningdeMacBook-Air.local
/Users/huaning
172.20.10.12
```

也可以单独测网络：

```bash
ping -c 2 -W 1000 172.20.10.12
nc -vz -G 3 172.20.10.12 22
```

如果 `172.20.10.12` 不通，可以尝试 mDNS 主机名：

```bash
ssh -o BatchMode=yes huaning@huaningdeMacBook-Air.local 'echo ok'
```

如果所有方式都失败，说明远程 Mac 掉线、休眠，或热点 IP 变了，需要用户确认。

## 3. 执行远程命令

基本格式：

```bash
ssh -o BatchMode=yes huaning-mac '命令'
```

示例：查看远程项目目录：

```bash
ssh huaning-mac 'cd /Users/huaning/work/tech_bit && pwd && ls -la'
```

示例：检查端口是否监听：

```bash
ssh huaning-mac 'lsof -nP -iTCP:8100 -sTCP:LISTEN'
```

示例：查看文件是否存在：

```bash
ssh huaning-mac 'test -f /Users/huaning/work/tech_bit/games/index.html && echo exists || echo missing'
```

## 4. 复制文件

复制单个文件到远程：

```bash
scp local/file.html huaning-mac:/Users/huaning/work/tech_bit/games/target/file.html
```

复制整个目录：

```bash
scp -r local/dir huaning-mac:/Users/huaning/work/tech_bit/games/
```

更稳的是先打包再解压：

```bash
tar -czf /tmp/project.tar.gz some/files
scp /tmp/project.tar.gz huaning-mac:/tmp/project.tar.gz
ssh huaning-mac 'mkdir -p /Users/huaning/work/tech_bit/remote-stage && tar -xzf /tmp/project.tar.gz -C /Users/huaning/work/tech_bit/remote-stage'
```

## 5. 远程项目路径

远程主项目目录：

```bash
/Users/huaning/work/tech_bit
```

常用子目录：

```bash
/Users/huaning/work/tech_bit/games
/Users/huaning/work/tech_bit/games/lottery-tower-defense
/Users/huaning/work/tech_bit/lan-game
/Users/huaning/work/tech_bit/center/releases
```

游戏中心当前服务目录是一个 `current` 链接：

```bash
/Users/huaning/work/tech_bit/current
```

## 6. 游戏中心部署

本地项目里有部署脚本：

```bash
/Users/dengyang/work/tech_bit/games/deploy_center.sh
```

部署到远程：

```bash
cd /Users/dengyang/work/tech_bit
./games/deploy_center.sh huaning-mac
```

这个脚本会：

1. 打包本地 `games/`
2. 传到远程
3. 在远程创建新的 release 目录
4. 原子切换 `/Users/huaning/work/tech_bit/current`
5. 不需要重启游戏中心

部署完成后检查：

```bash
curl -fsS http://172.20.10.12:8100/healthz
curl -fsS http://172.20.10.12:8100/games/index.html | head
```

## 7. 远程 macOS 服务管理

远程游戏中心使用 launchd 服务：

```text
Label: com.techbit.gamecenter
Plist: /Users/huaning/work/tech_bit/games/com.techbit.gamecenter.plist
Port: 8100
```

查看状态：

```bash
ssh huaning-mac 'launchctl print "gui/$(id -u)/com.techbit.gamecenter" | head -40'
```

重启游戏中心：

```bash
ssh huaning-mac 'launchctl kickstart -k "gui/$(id -u)/com.techbit.gamecenter"'
```

检查端口：

```bash
ssh huaning-mac 'lsof -nP -iTCP:8100 -sTCP:LISTEN'
```

## 8. 在远程 Mac 上打开浏览器页面

```bash
ssh huaning-mac 'open "http://172.20.10.12:8100/games/index.html"'
```

也可以打开本地文件或目录：

```bash
ssh huaning-mac 'open /Users/huaning/work/tech_bit/games'
```

## 9. 常用端口

| 端口 | 用途 |
|---:|---|
| 8100 | 游戏中心静态站 |
| 8300 | 反转盲盒抽奖 |
| 8400 | 迷宫竞速联机 |
| 8700 | 俄罗斯方块联机 |
| 8765 | LAN Orb Rush |

检查某个端口：

```bash
ssh huaning-mac 'lsof -nP -iTCP:8300 -sTCP:LISTEN'
```

## 10. 排错

### SSH 显示 `Host is down`

通常是远程 Mac 掉线、休眠或热点断开。

处理：

1. 让用户确认另一台 Mac 已亮屏并连接热点
2. 再执行：

```bash
ping -c 2 -W 1000 172.20.10.12
ssh -o BatchMode=yes huaning-mac 'echo ok'
```

### SSH 显示 `Connection refused`

远程 Mac 在线，但目标端口没有服务。

检查：

```bash
ssh huaning-mac 'lsof -nP -iTCP:8100 -sTCP:LISTEN'
```

### SSH 显示 `Permission denied`

可能是用户名、公钥或远程磁盘/权限变化。

检查：

```bash
ssh -v -o BatchMode=yes huaning-mac 'echo ok' 2>&1 | tail -40
```

### 远程命令提示需要 Full Disk Access

macOS 的部分系统设置命令可能受限。不要强行绕过，优先让用户在远程 Mac 的「系统设置 → 通用 → 共享 → 远程登录」中确认开关已打开。

## 11. Agent 安全规则

自动化 Agent 操作远程 Mac 时应遵守：

1. 不要读取、复制、输出 `~/.ssh/id_*` 私钥
2. 不要把密码、token、cookie 写入文档
3. 不要执行大面积 `rm -rf`
4. 不要随意 kill 未知进程；先确认端口、PID 和命令
5. 修改前先检查目标文件是否存在
6. 修改远程文件优先使用本地准备好的完整文件 + `scp`
7. 对游戏中心等在线服务，尽量使用原子发布脚本，不要频繁重启
8. 操作后必须用 HTTP 状态码、文件哈希或测试命令验证
