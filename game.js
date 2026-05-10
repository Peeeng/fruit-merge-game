const {
  Engine,
  World,
  Bodies,
  Body,
  Events,
  Runner,
  Composite
} = Matter;

/**
 * 水果配置表。
 * level 表示水果等级，radius 决定碰撞大小，score 表示合成到该水果时增加的分数。
 */
const FRUITS = [
  { level: 0, name: "樱桃", radius: 30, color: "#ff6b6b", accent: "#ffd6d6", score: 10 },
  { level: 1, name: "草莓", radius: 40, color: "#ff5c8a", accent: "#ffd0de", score: 20 },
  { level: 2, name: "葡萄", radius: 51, color: "#8e5eff", accent: "#ddd2ff", score: 35 },
  { level: 3, name: "橘子", radius: 61, color: "#ff9f43", accent: "#ffe0ba", score: 55 },
  { level: 4, name: "柠檬", radius: 72, color: "#ffd93d", accent: "#fff4b3", score: 80 },
  { level: 5, name: "猕猴桃", radius: 83, color: "#78c850", accent: "#d9f3c5", score: 120 },
  { level: 6, name: "桃子", radius: 96, color: "#ff9eb5", accent: "#ffe1e8", score: 180 },
  { level: 7, name: "菠萝", radius: 112, color: "#f7c948", accent: "#fff0b5", score: 260 },
  { level: 8, name: "椰子", radius: 129, color: "#8d6e63", accent: "#d7c1b9", score: 360 },
  { level: 9, name: "西瓜", radius: 148, color: "#4caf50", accent: "#d7f3cb", score: 520 }
];

const UNLOCK_LEVEL_FOR_THIRD_START_FRUIT = 3;
const FLOOR_VISIBLE_MARGIN = 22;


/**
 * 游戏主类，负责 Matter 世界、输入处理、渲染和状态管理。
 */
class FruitMergeGame {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.gameContainer = document.getElementById("gameContainer");
    this.scoreValue = document.getElementById("scoreValue");
    this.bestScoreValue = document.getElementById("bestScoreValue");
    this.dropPreviewCanvas = document.getElementById("dropPreviewCanvas");
    this.dropPreviewCtx = this.dropPreviewCanvas.getContext("2d");
    this.landingMarker = document.getElementById("landingMarker");
    this.dangerLineElement = document.getElementById("dangerLine");
    this.soundButton = document.getElementById("soundButton");
    this.pauseButton = document.getElementById("pauseButton");
    this.restartButton = document.getElementById("restartButton");
    this.resumeButton = document.getElementById("resumeButton");
    this.overlayRestartButton = document.getElementById("overlayRestartButton");
    this.pauseOverlay = document.getElementById("pauseOverlay");
    this.gameOverOverlay = document.getElementById("gameOverOverlay");
    this.gameStateText = document.getElementById("gameStateText");
    this.comboText = document.getElementById("comboText");
    this.finalScoreValue = document.getElementById("finalScoreValue");
    this.maxComboValue = document.getElementById("maxComboValue");

    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.wallThickness = 80;
    this.dangerLineY = 120;
    this.dropOffsetAboveDangerLine = 24;
    this.dropY = this.dangerLineY - this.dropOffsetAboveDangerLine;
    this.maxBodies = 80;
    this.maxEffects = 18;
    this.dropCooldown = 260;
    this.mergeCooldown = 120;
    this.gameOverHoldMs = 1800;
    this.highScoreKey = "fruit-merge-best-score";
    this.soundEnabledKey = "fruit-merge-sound-enabled";

    this.engine = null;
    this.world = null;
    this.runner = null;
    this.animationFrameId = 0;
    this.boundCollisionStart = null;
    this.boundCollisionActive = null;
    this.pendingMergePairs = new Set();
    this.mergeGlowFruitIds = new Set();
    this.mergePairCooldown = new Map();
    this.mergePairCooldownMs = 180;
    this.contactMergeTolerance = 10;

    this.fruits = [];
    this.mergeEffects = [];
    this.score = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.lastMergeAt = 0;
    this.lastComboRewardAt = 0;
    this.lastComboRewardStep = 2;
    this.comboChainWindowMs = 650;
    this.bestScore = this.readBestScore();
    this.nextFruitLevel = 0;
    this.highestUnlockedLevel = 1;
    this.currentDropX = this.width / 2;
    this.canDrop = true;
    this.isPaused = false;
    this.isGameOver = false;
    this.lastDropTime = 0;
    this.lastGameOverCheckTime = 0;
    this.isPointerActive = false;
    this.lastImpactSoundTime = 0;
    this.audioContext = null;
    this.masterGain = null;
    this.musicGain = null;
    this.musicOscillators = [];
    this.musicTimerId = 0;
    this.musicStepIndex = 0;
    this.soundEnabled = this.readSoundEnabled();

    this.updateBestScoreText();
    this.updateSoundButtonText();
    this.bindEvents();
    this.startNewGame();
  }

  /**
   * 绑定按钮和触摸/鼠标事件。
   */
  bindEvents() {
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.loop = this.loop.bind(this);

    this.gameContainer.addEventListener("pointermove", this.handlePointerMove);
    this.gameContainer.addEventListener("pointerdown", this.handlePointerDown);
    this.gameContainer.addEventListener("pointerleave", this.handlePointerLeave);

    this.soundButton.addEventListener("click", () => {
      this.soundEnabled = !this.soundEnabled;
      window.localStorage.setItem(this.soundEnabledKey, String(this.soundEnabled));
      this.updateSoundButtonText();

      if (this.soundEnabled) {
        this.ensureAudioContext();
        this.startBackgroundMusic();
        this.playSound("toggle-on");
      } else {
        this.stopBackgroundMusic();
      }
    });


    this.pauseButton.addEventListener("click", () => {
      if (this.isGameOver) {
        return;
      }

      if (this.isPaused) {
        this.resumeGame();
      } else {
        this.pauseGame();
      }
    });

    this.resumeButton.addEventListener("click", () => this.resumeGame());
    this.restartButton.addEventListener("click", () => this.startNewGame());
    this.overlayRestartButton.addEventListener("click", () => this.startNewGame());

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && !this.isGameOver) {
        this.pauseGame();
      }
    });
  }

  /**
   * 创建新的一局，若已有旧世界则完整销毁后重建。
   */
  startNewGame() {
    this.destroyWorld();

    this.engine = Engine.create({
      gravity: { x: 0, y: 1.05 },
      enableSleeping: true
    });

    this.world = this.engine.world;
    this.world.gravity.scale = 0.0012;

    this.runner = Runner.create();
    Runner.run(this.runner, this.engine);

    this.fruits = [];
    this.mergeEffects = [];
    this.score = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.lastMergeAt = 0;
    this.lastComboRewardAt = 0;
    this.lastComboRewardStep = 2;
    this.comboChainWindowMs = 650;
    this.isPaused = false;
    this.isGameOver = false;
    this.canDrop = true;
    this.lastDropTime = 0;
    this.lastGameOverCheckTime = 0;
    this.currentDropX = this.width / 2;
    this.nextFruitLevel = this.getRandomStartFruitLevel();

    this.createBounds();
    this.registerCollisionEvents();
    this.updateScoreText();
    this.updateComboText();
    this.updateStateText();
    this.updatePauseUI();
    this.updateOverlayVisibility();
    this.updateDangerLinePosition();
    this.updateDropIndicator();
    this.startBackgroundMusic();

    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  /**
   * 创建左右墙和地面，提高水果堆叠稳定性。
   */
  createBounds() {
    const staticOptions = {
      isStatic: true,
      friction: 0.9,
      restitution: 0.05,
      render: { visible: false }
    };

    const floor = Bodies.rectangle(
      this.width / 2,
      this.height - FLOOR_VISIBLE_MARGIN + this.wallThickness / 2,
      this.width,
      this.wallThickness,
      staticOptions
    );

    const leftWall = Bodies.rectangle(
      -this.wallThickness / 2,
      this.height / 2,
      this.wallThickness,
      this.height * 2,
      staticOptions
    );

    const rightWall = Bodies.rectangle(
      this.width + this.wallThickness / 2,
      this.height / 2,
      this.wallThickness,
      this.height * 2,
      staticOptions
    );

    World.add(this.world, [floor, leftWall, rightWall]);
  }

  /**
   * 注册碰撞监听，只保留一个监听器，避免重开后重复触发。
   */
  registerCollisionEvents() {
    this.boundCollisionStart = (event) => {
      if (this.isPaused || this.isGameOver) {
        return;
      }

      for (const pair of event.pairs) {
        this.playImpactSoundForPair(pair);
        this.tryMerge(pair.bodyA, pair.bodyB);
      }
    };

    this.boundCollisionActive = (event) => {
      if (this.isPaused || this.isGameOver) {
        return;
      }

      this.mergeGlowFruitIds.clear();

      for (const pair of event.pairs) {
        this.queueContinuousMerge(pair.bodyA, pair.bodyB);
      }
    };

    Events.on(this.engine, "collisionStart", this.boundCollisionStart);
    Events.on(this.engine, "collisionActive", this.boundCollisionActive);
  }

  /**
   * 检查两个刚体是否满足合成的基础条件。
   */
  canMergeBodies(bodyA, bodyB) {
    const fruitA = bodyA.plugin && bodyA.plugin.fruit;
    const fruitB = bodyB.plugin && bodyB.plugin.fruit;

    if (!fruitA || !fruitB) {
      return { canMerge: false };
    }

    if (fruitA.level !== fruitB.level) {
      return { canMerge: false };
    }

    if (fruitA.level >= FRUITS.length - 1) {
      return { canMerge: false };
    }

    if (fruitA.merged || fruitB.merged) {
      return { canMerge: false };
    }

    const now = performance.now();
    if (now - fruitA.bornAt < this.mergeCooldown || now - fruitB.bornAt < this.mergeCooldown) {
      return { canMerge: false };
    }

    const pairKey = this.getPairKey(bodyA, bodyB);
    const lastMergedAt = this.mergePairCooldown.get(pairKey) || 0;
    if (now - lastMergedAt < this.mergePairCooldownMs) {
      return { canMerge: false };
    }

    return { canMerge: true, fruitA, fruitB, now };
  }

  /**
   * 为持续接触的同级水果排队合成，解决只触发一次碰撞事件的问题。
   */
  queueContinuousMerge(bodyA, bodyB) {
    const validation = this.canMergeBodies(bodyA, bodyB);
    if (!validation.canMerge) {
      return;
    }

    const fruitA = bodyA.plugin.fruit;
    const fruitB = bodyB.plugin.fruit;
    const distance = Math.hypot(bodyA.position.x - bodyB.position.x, bodyA.position.y - bodyB.position.y);
    const targetDistance = fruitA.radius + fruitB.radius + this.contactMergeTolerance;
    if (distance > targetDistance) {
      return;
    }

    this.pendingMergePairs.add(this.getPairKey(bodyA, bodyB));
    this.mergeGlowFruitIds.add(bodyA.id);
    this.mergeGlowFruitIds.add(bodyB.id);
    this.tryMerge(bodyA, bodyB);
  }

  /**
   * 生成稳定的水果对 key。
   */
  getPairKey(bodyA, bodyB) {
    return bodyA.id < bodyB.id ? `${bodyA.id}-${bodyB.id}` : `${bodyB.id}-${bodyA.id}`;
  }

  /**
   * 根据等级创建水果刚体，并写入自定义元数据。
   */
  createFruit(level, x, y, options = {}) {
    const fruitDef = FRUITS[level];
    const fruit = Bodies.circle(x, y, fruitDef.radius, {
      restitution: 0.08,
      friction: 0.015,
      frictionAir: 0.012,
      frictionStatic: 0.65,
      density: 0.0018 + level * 0.00016,
      slop: 0.04,
      sleepThreshold: 50,
      label: `fruit-${level}`
    });

    fruit.plugin = fruit.plugin || {};
    fruit.plugin.fruit = {
      level,
      name: fruitDef.name,
      radius: fruitDef.radius,
      color: fruitDef.color,
      accent: fruitDef.accent,
      merged: false,
      bornAt: performance.now()
    };

    if (options.initialVelocity) {
      Body.setVelocity(fruit, options.initialVelocity);
    }

    if (options.angle) {
      Body.setAngle(fruit, options.angle);
    }

    World.add(this.world, fruit);
    this.fruits.push(fruit);
    return fruit;
  }

  /**
   * 投放新水果，使用 nextFruitLevel 作为当前投放对象。
   */
  dropFruit() {
    if (!this.canDrop || this.isPaused || this.isGameOver) {
      return;
    }

    if (this.fruits.length >= this.maxBodies) {
      return;
    }

    const now = performance.now();
    if (now - this.lastDropTime < this.dropCooldown) {
      return;
    }

    const level = this.nextFruitLevel;
    const radius = FRUITS[level].radius;
    const dropX = this.clamp(this.currentDropX, radius + 8, this.width - radius - 8);
    const dropY = this.dangerLineY - radius - 6;

    this.createFruit(level, dropX, dropY, {
      angle: (Math.random() - 0.5) * 0.08
    });

    this.playSound("drop");
    this.lastDropTime = now;
    this.canDrop = false;

    window.setTimeout(() => {
      this.canDrop = true;
    }, this.dropCooldown);

    this.nextFruitLevel = this.getRandomStartFruitLevel();
    this.animatePreviewRefresh();
    this.updateDropIndicator();
  }

  /**
   * 尝试合成两个水果，确保同等级、未被处理且不是最高等级。
   */
  tryMerge(bodyA, bodyB) {
    const validation = this.canMergeBodies(bodyA, bodyB);
    if (!validation.canMerge) {
      return;
    }

    const { fruitA, fruitB, now } = validation;
    const pairKey = this.getPairKey(bodyA, bodyB);
    this.mergePairCooldown.set(pairKey, now);
    this.pendingMergePairs.delete(pairKey);

    fruitA.merged = true;
    fruitB.merged = true;

    const nextLevel = fruitA.level + 1;
    const centerX = (bodyA.position.x + bodyB.position.x) / 2;
    const centerY = (bodyA.position.y + bodyB.position.y) / 2;
    const velocity = {
      x: (bodyA.velocity.x + bodyB.velocity.x) * 0.15,
      y: Math.min((bodyA.velocity.y + bodyB.velocity.y) * 0.15, 2)
    };

    this.removeFruit(bodyA);
    this.removeFruit(bodyB);

    this.createFruit(nextLevel, centerX, centerY, {
      initialVelocity: velocity,
      angle: (Math.random() - 0.5) * 0.12
    });

    if (nextLevel >= UNLOCK_LEVEL_FOR_THIRD_START_FRUIT) {
      this.highestUnlockedLevel = Math.max(this.highestUnlockedLevel, 2);
    }

    this.addMergeEffect(centerX, centerY, FRUITS[nextLevel].radius);
    this.registerCombo();
    this.addScore(FRUITS[nextLevel].score * this.combo);
    this.playSound("merge", nextLevel, this.combo);
    this.playComboReward(this.combo, nextLevel);
  }

  /**
   * 根据碰撞强度播放轻量命中音，避免连续堆叠时过度吵闹。
   */
  playImpactSoundForPair(pair) {
    const fruitA = pair.bodyA.plugin && pair.bodyA.plugin.fruit;
    const fruitB = pair.bodyB.plugin && pair.bodyB.plugin.fruit;

    if (!fruitA || !fruitB) {
      return;
    }

    if (fruitA.merged || fruitB.merged) {
      return;
    }

    const now = performance.now();
    if (now - this.lastImpactSoundTime < 75) {
      return;
    }

    const relativeVelocityX = pair.bodyA.velocity.x - pair.bodyB.velocity.x;
    const relativeVelocityY = pair.bodyA.velocity.y - pair.bodyB.velocity.y;
    const impactStrength = Math.hypot(relativeVelocityX, relativeVelocityY);

    if (impactStrength < 1.6) {
      return;
    }

    const level = Math.max(fruitA.level, fruitB.level);
    this.lastImpactSoundTime = now;
    this.playSound("impact", level, impactStrength);
  }

  /**
   * 从世界和水果列表中移除水果刚体。
   */
  removeFruit(body) {
    this.fruits = this.fruits.filter((item) => item.id !== body.id);
    World.remove(this.world, body);
  }

  /**
   * 添加一个简洁的合成扩散动画。
   */
  addMergeEffect(x, y, radius) {
    if (this.mergeEffects.length >= this.maxEffects) {
      this.mergeEffects.shift();
    }

    this.mergeEffects.push({
      x,
      y,
      radius,
      life: 0,
      maxLife: 22,
      particles: Array.from({ length: 8 }, (_, index) => ({
        angle: (Math.PI * 2 * index) / 8,
        speed: 1.4 + Math.random() * 1.6
      }))
    });
  }

  /**
   * 注册连击节奏，短时间连续合成会提升倍率。
   */
  registerCombo() {
    const now = performance.now();
    const recentMerge = now - this.lastMergeAt <= this.comboChainWindowMs;
    this.combo = recentMerge ? this.combo + 1 : 1;
    this.lastMergeAt = now;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.updateComboText();
  }

  /**
   * 游戏主循环，负责渲染和顶部越线检测。
   */
  loop() {
    this.render();

    if (!this.isPaused && !this.isGameOver) {
      this.checkGameOver();
      this.updateEffects();
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  /**
   * 检查水果是否持续压线，避免瞬时触碰直接结束。
   */
  checkGameOver() {
    const now = performance.now();
    const hasDangerFruit = this.fruits.some((fruit) => {
      const data = fruit.plugin.fruit;
      if (data.merged) {
        return false;
      }

      return fruit.position.y - data.radius < this.dangerLineY;
    });

    if (hasDangerFruit) {
      if (!this.lastGameOverCheckTime) {
        this.lastGameOverCheckTime = now;
      }

      if (now - this.lastGameOverCheckTime >= this.gameOverHoldMs) {
        this.endGame();
      }
    } else {
      this.lastGameOverCheckTime = 0;
    }
  }

  /**
   * 结束游戏并记录最高分。
   */
  endGame() {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.isPaused = false;
    this.updateBestScore(this.score);
    this.finalScoreValue.textContent = String(this.score);
    this.maxComboValue.textContent = String(this.maxCombo);
    this.updateStateText();
    this.updatePauseUI();
    this.updateOverlayVisibility();
    this.playSound("gameover");

    if (this.runner) {
      Runner.stop(this.runner);
    }

    this.stopBackgroundMusic();
  }

  /**
   * 暂停游戏，同时停止物理计算。
   */
  pauseGame() {
    if (this.isPaused || this.isGameOver) {
      return;
    }

    this.isPaused = true;
    this.updateStateText();
    this.updatePauseUI();
    this.updateOverlayVisibility();

    if (this.runner) {
      Runner.stop(this.runner);
    }

    this.stopBackgroundMusic();
  }

  /**
   * 恢复游戏并继续运行物理引擎。
   */
  resumeGame() {
    if (!this.isPaused || this.isGameOver) {
      return;
    }

    this.isPaused = false;
    this.lastGameOverCheckTime = 0;
    this.updateStateText();
    this.updatePauseUI();
    this.updateOverlayVisibility();

    if (this.runner) {
      Runner.run(this.runner, this.engine);
    }

    this.startBackgroundMusic();
  }

  /**
   * 更新分数并同步本地最高分。
   */
  addScore(value) {
    this.score += value;
    this.updateScoreText();
    this.updateBestScore(this.score);
  }

  /**
   * 读取 localStorage 中的最高分。
   */
  readBestScore() {
    const value = window.localStorage.getItem(this.highScoreKey);
    const bestScore = Number(value || 0);
    return Number.isFinite(bestScore) ? bestScore : 0;
  }

  /**
   * 读取音效开关状态，默认开启。
   */
  readSoundEnabled() {
    const value = window.localStorage.getItem(this.soundEnabledKey);
    if (value === null) {
      return true;
    }

    return value === "true";
  }

  /**
   * 读取音量设置。
   */
  /**
   * 持久化最高分。
   */
  updateBestScore(score) {
    if (score <= this.bestScore) {
      return;
    }

    this.bestScore = score;
    window.localStorage.setItem(this.highScoreKey, String(score));
    this.updateBestScoreText();
  }

  /**
   * 渲染整个画面，包括背景、水果、预警和动画特效。
   */
  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground();
    this.drawDangerZoneGlow();

    for (const fruit of this.fruits) {
      const isMergeReady = this.mergeGlowFruitIds.has(fruit.id);
      this.drawFruit(this.ctx, fruit.position.x, fruit.position.y, fruit.angle, fruit.plugin.fruit, isMergeReady);
    }

    this.drawMergeEffects();
    this.mergeGlowFruitIds.clear();
  }

  /**
   * 绘制背景装饰，让界面更像轻松小游戏。
   */
  drawBackground() {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#fff8fb");
    gradient.addColorStop(1, "#fff0d9");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    this.ctx.beginPath();
    this.ctx.arc(84, 100, 58, 0, Math.PI * 2);
    this.ctx.arc(128, 90, 38, 0, Math.PI * 2);
    this.ctx.arc(334, 146, 52, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * 在警戒线区域增加柔和提示效果。
   */
  drawDangerZoneGlow() {
    const dangerGradient = this.ctx.createLinearGradient(0, 0, 0, this.dangerLineY + 70);
    dangerGradient.addColorStop(0, "rgba(255, 124, 149, 0.16)");
    dangerGradient.addColorStop(1, "rgba(255, 124, 149, 0)");
    this.ctx.fillStyle = dangerGradient;
    this.ctx.fillRect(0, 0, this.width, this.dangerLineY + 70);
  }

  /**
   * 绘制单个水果，为每种水果提供易区分的独特外形特征。
   */
  drawFruit(ctx, x, y, angle, fruit, isMergeReady = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (isMergeReady) {
      const pulse = 1 + Math.sin(performance.now() / 90) * 0.06;
      ctx.strokeStyle = "rgba(255, 153, 102, 0.95)";
      ctx.lineWidth = Math.max(3, fruit.radius * 0.08);
      ctx.shadowColor = "rgba(255, 170, 102, 0.55)";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, fruit.radius * pulse * 1.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.lineWidth = Math.max(2, fruit.radius * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, fruit.radius * pulse * 1.04, 0, Math.PI * 2);
      ctx.stroke();
    }

    switch (fruit.level) {
      case 0:
        this.drawCherry(ctx, fruit.radius);
        break;
      case 1:
        this.drawStrawberry(ctx, fruit.radius);
        break;
      case 2:
        this.drawGrape(ctx, fruit.radius);
        break;
      case 3:
        this.drawOrange(ctx, fruit.radius);
        break;
      case 4:
        this.drawLemon(ctx, fruit.radius);
        break;
      case 5:
        this.drawKiwi(ctx, fruit.radius);
        break;
      case 6:
        this.drawPeach(ctx, fruit.radius);
        break;
      case 7:
        this.drawPineapple(ctx, fruit.radius);
        break;
      case 8:
        this.drawCoconut(ctx, fruit.radius);
        break;
      case 9:
        this.drawWatermelon(ctx, fruit.radius);
        break;
      default:
        this.drawBasicFruit(ctx, fruit.radius, fruit.color, fruit.accent);
        break;
    }

    ctx.restore();
  }

  /**
   * 绘制基础圆形水果，作为兜底图形。
   */
  drawBasicFruit(ctx, radius, color, accent) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    const gradient = ctx.createRadialGradient(-radius * 0.35, -radius * 0.45, radius * 0.1, -radius * 0.2, -radius * 0.25, radius);
    gradient.addColorStop(0, accent);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 樱桃：双果连枝，辨识度最高。
   */
  drawCherry(ctx, radius) {
    const ballRadius = radius * 0.68;

    ctx.strokeStyle = "#5f9c3b";
    ctx.lineWidth = Math.max(2, radius * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-ballRadius * 0.3, -ballRadius * 0.9);
    ctx.quadraticCurveTo(-ballRadius * 0.1, -radius * 1.55, 0, -radius * 1.25);
    ctx.quadraticCurveTo(ballRadius * 0.2, -radius * 1.6, ballRadius * 0.4, -ballRadius * 1.05);
    ctx.stroke();

    ctx.fillStyle = "#70bf44";
    ctx.beginPath();
    ctx.ellipse(radius * 0.08, -radius * 1.12, radius * 0.26, radius * 0.14, -0.3, 0, Math.PI * 2);
    ctx.fill();

    this.drawCherryBall(ctx, -ballRadius * 0.62, radius * 0.14, ballRadius);
    this.drawCherryBall(ctx, ballRadius * 0.62, radius * 0.14, ballRadius);
  }

  /**
   * 绘制单颗樱桃果实。
   */
  drawCherryBall(ctx, x, y, radius) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#d81e3f";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    const gradient = ctx.createRadialGradient(-radius * 0.4, -radius * 0.45, radius * 0.08, -radius * 0.2, -radius * 0.2, radius);
    gradient.addColorStop(0, "#ffb6c5");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 草莓：心形轮廓与籽点。
   */
  drawStrawberry(ctx, radius) {
    ctx.fillStyle = "#f4435e";
    ctx.beginPath();
    ctx.moveTo(0, radius * 0.95);
    ctx.bezierCurveTo(radius * 0.95, radius * 0.45, radius * 0.9, -radius * 0.55, 0, -radius * 0.7);
    ctx.bezierCurveTo(-radius * 0.9, -radius * 0.55, -radius * 0.95, radius * 0.45, 0, radius * 0.95);
    ctx.fill();

    ctx.fillStyle = "#6cbc45";
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (i - 2) * 0.38;
      ctx.beginPath();
      ctx.moveTo(0, -radius * 0.48);
      ctx.lineTo(Math.cos(angle) * radius * 0.55, -radius * 0.72 + Math.sin(angle) * radius * 0.18);
      ctx.lineTo(Math.cos(angle + 0.2) * radius * 0.22, -radius * 0.2 + Math.sin(angle + 0.2) * radius * 0.1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#ffd966";
    const seeds = [
      [-0.3, -0.12], [0, -0.18], [0.28, -0.08],
      [-0.38, 0.18], [-0.08, 0.1], [0.22, 0.18],
      [-0.2, 0.42], [0.12, 0.4]
    ];
    for (const [sx, sy] of seeds) {
      ctx.beginPath();
      ctx.ellipse(radius * sx, radius * sy, radius * 0.07, radius * 0.11, 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 葡萄：由多个小果粒组成一串。
   */
  drawGrape(ctx, radius) {
    ctx.strokeStyle = "#5f9c3b";
    ctx.lineWidth = Math.max(2, radius * 0.1);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -radius * 1.02);
    ctx.lineTo(radius * 0.08, -radius * 1.3);
    ctx.stroke();

    ctx.fillStyle = "#6cbc45";
    ctx.beginPath();
    ctx.ellipse(radius * 0.18, -radius * 1.08, radius * 0.26, radius * 0.14, -0.35, 0, Math.PI * 2);
    ctx.fill();

    const grapes = [
      [0, -0.45],
      [-0.28, -0.18], [0.28, -0.18],
      [-0.45, 0.12], [0, 0.08], [0.45, 0.12],
      [-0.22, 0.42], [0.22, 0.42],
      [0, 0.68]
    ];

    for (const [gx, gy] of grapes) {
      const r = radius * 0.27;
      ctx.fillStyle = "#7d3fd3";
      ctx.beginPath();
      ctx.arc(radius * gx, radius * gy, r, 0, Math.PI * 2);
      ctx.fill();

      const gradient = ctx.createRadialGradient(radius * gx - r * 0.35, radius * gy - r * 0.4, r * 0.05, radius * gx - r * 0.15, radius * gy - r * 0.15, r);
      gradient.addColorStop(0, "#d4b0ff");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(radius * gx, radius * gy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 橘子：圆形果皮加橘瓣纹理。
   */
  drawOrange(ctx, radius) {
    this.drawBasicFruit(ctx, radius, "#ff9f2f", "#ffe0ad");

    ctx.strokeStyle = "rgba(255, 148, 44, 0.9)";
    ctx.lineWidth = Math.max(2, radius * 0.07);
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI / 4) * i;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.12, Math.sin(angle) * radius * 0.12);
      ctx.lineTo(Math.cos(angle) * radius * 0.72, Math.sin(angle) * radius * 0.72);
      ctx.stroke();
    }

    ctx.fillStyle = "#6cbc45";
    ctx.beginPath();
    ctx.ellipse(radius * 0.1, -radius * 0.86, radius * 0.24, radius * 0.13, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 柠檬：左右尖头的椭圆轮廓。
   */
  drawLemon(ctx, radius) {
    ctx.fillStyle = "#ffd84d";
    ctx.beginPath();
    ctx.moveTo(-radius * 0.88, 0);
    ctx.quadraticCurveTo(-radius * 0.5, -radius * 0.82, 0, -radius * 0.75);
    ctx.quadraticCurveTo(radius * 0.5, -radius * 0.82, radius * 0.88, 0);
    ctx.quadraticCurveTo(radius * 0.5, radius * 0.82, 0, radius * 0.75);
    ctx.quadraticCurveTo(-radius * 0.5, radius * 0.82, -radius * 0.88, 0);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(-radius * 0.18, -radius * 0.24, radius * 0.42, radius * 0.2, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f0c632";
    ctx.lineWidth = Math.max(2, radius * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.5, -0.6, 0.6);
    ctx.stroke();
  }

  /**
   * 猕猴桃：棕色外皮、绿色切面、中心白心与黑籽。
   */
  drawKiwi(ctx, radius) {
    ctx.fillStyle = "#8a5a3d";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#89d34b";
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f8f5de";
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.23, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12;
      ctx.strokeStyle = "rgba(243, 248, 200, 0.95)";
      ctx.lineWidth = Math.max(1.5, radius * 0.03);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.25, Math.sin(angle) * radius * 0.25);
      ctx.lineTo(Math.cos(angle) * radius * 0.68, Math.sin(angle) * radius * 0.68);
      ctx.stroke();

      ctx.fillStyle = "#2d241f";
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * radius * 0.48, Math.sin(angle) * radius * 0.48, radius * 0.04, radius * 0.08, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 桃子：顶部凹陷和中缝。
   */
  drawPeach(ctx, radius) {
    ctx.fillStyle = "#ffb1ba";
    ctx.beginPath();
    ctx.moveTo(0, radius * 0.92);
    ctx.bezierCurveTo(radius * 0.95, radius * 0.55, radius * 0.9, -radius * 0.2, radius * 0.18, -radius * 0.88);
    ctx.quadraticCurveTo(0, -radius * 0.68, -radius * 0.18, -radius * 0.88);
    ctx.bezierCurveTo(-radius * 0.9, -radius * 0.2, -radius * 0.95, radius * 0.55, 0, radius * 0.92);
    ctx.fill();

    const gradient = ctx.createRadialGradient(-radius * 0.32, -radius * 0.38, radius * 0.05, -radius * 0.18, -radius * 0.2, radius * 1.05);
    gradient.addColorStop(0, "#ffe6ea");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(237, 126, 148, 0.85)";
    ctx.lineWidth = Math.max(2, radius * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.6);
    ctx.quadraticCurveTo(-radius * 0.12, 0, 0, radius * 0.78);
    ctx.stroke();

    ctx.fillStyle = "#7ec850";
    ctx.beginPath();
    ctx.ellipse(radius * 0.22, -radius * 0.84, radius * 0.24, radius * 0.12, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 菠萝：金黄椭圆果身配绿色叶冠和交叉纹理。
   */
  drawPineapple(ctx, radius) {
    ctx.fillStyle = "#f5bf33";
    ctx.beginPath();
    ctx.ellipse(0, radius * 0.14, radius * 0.72, radius * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4caf50";
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, -radius * 0.44);
      ctx.lineTo(i * radius * 0.18, -radius * 1.18);
      ctx.lineTo(i * radius * 0.08 + radius * 0.08, -radius * 0.48);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(183, 119, 23, 0.55)";
    ctx.lineWidth = Math.max(2, radius * 0.055);
    for (let i = -3; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.5, radius * (i * 0.24 - 0.34));
      ctx.lineTo(radius * 0.5, radius * (i * 0.24 + 0.3));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(radius * 0.5, radius * (i * 0.24 - 0.34));
      ctx.lineTo(-radius * 0.5, radius * (i * 0.24 + 0.3));
      ctx.stroke();
    }
  }

  /**
   * 椰子：深色硬壳加切口高光。
   */
  drawCoconut(ctx, radius) {
    ctx.fillStyle = "#7b5238";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#a97957";
    ctx.beginPath();
    ctx.arc(0, -radius * 0.08, radius * 0.78, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f5efe5";
    ctx.beginPath();
    ctx.arc(radius * 0.18, -radius * 0.14, radius * 0.48, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6a402c";
    const holes = [[-0.2, 0.06], [0.02, 0.2], [-0.1, 0.28]];
    for (const [hx, hy] of holes) {
      ctx.beginPath();
      ctx.arc(radius * hx, radius * hy, radius * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 西瓜：绿色外皮、深绿条纹和切片高光感。
   */
  drawWatermelon(ctx, radius) {
    ctx.fillStyle = "#58b957";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#2f8d43";
    ctx.lineWidth = Math.max(3, radius * 0.08);
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(radius * i * 0.18, -radius * 0.92);
      ctx.bezierCurveTo(radius * (i * 0.22 + 0.08), -radius * 0.35, radius * (i * 0.15 - 0.08), radius * 0.32, radius * i * 0.2, radius * 0.92);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.ellipse(-radius * 0.22, -radius * 0.36, radius * 0.38, radius * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1f1f1f";
    const seeds = [[-0.18, -0.04], [0.08, 0.08], [0.28, -0.12]];
    for (const [sx, sy] of seeds) {
      ctx.beginPath();
      ctx.ellipse(radius * sx, radius * sy, radius * 0.04, radius * 0.085, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 绘制下一个水果预览。
   */
  /**
   * 待落水果切换时做一个短促过渡动画。
   */
  animatePreviewRefresh() {
    this.dropPreviewCanvas.style.transform = "translateY(-8px) scale(0.9)";

    window.setTimeout(() => {
      this.dropPreviewCanvas.style.transform = "translateY(0) scale(1)";
    }, 180);
  }

  /**
   * 更新合成动画生命周期。
   */
  updateEffects() {
    if (performance.now() - this.lastMergeAt >= this.comboChainWindowMs && this.combo !== 1) {
      this.combo = 1;
      this.lastComboRewardStep = 2;
      this.comboText.classList.remove("combo-tier-1", "combo-tier-2", "combo-tier-3");
      this.updateComboText();
    }

    this.mergeEffects = this.mergeEffects.filter((effect) => {
      effect.life += 1;
      return effect.life <= effect.maxLife;
    });
  }

  /**
   * 绘制合成动画扩散环。
   */
  drawMergeEffects() {
    for (const effect of this.mergeEffects) {
      const progress = effect.life / effect.maxLife;
      const alpha = 1 - progress;
      const radius = effect.radius + progress * 20;

      this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      this.ctx.lineWidth = 4 - progress * 2.2;
      this.ctx.beginPath();
      this.ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.fillStyle = `rgba(255, 245, 197, ${alpha * 0.45})`;
      this.ctx.beginPath();
      this.ctx.arc(effect.x, effect.y, radius * 0.72, 0, Math.PI * 2);
      this.ctx.fill();

      for (const particle of effect.particles) {
        const px = effect.x + Math.cos(particle.angle) * progress * effect.radius * particle.speed;
        const py = effect.y + Math.sin(particle.angle) * progress * effect.radius * particle.speed;
        this.ctx.fillStyle = `rgba(255, 183, 94, ${alpha * 0.8})`;
        this.ctx.beginPath();
        this.ctx.arc(px, py, Math.max(1.5, 4 - progress * 3), 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  /**
   * 根据指针位置更新投放参考线。
   */
  handlePointerMove(event) {
    const position = this.getPointerPosition(event);
    this.currentDropX = position.x;
    this.isPointerActive = true;
    this.updateDropIndicator();
  }

  /**
   * 在 PC 和移动端统一处理点击/触摸投放。
   */
  handlePointerDown(event) {
    event.preventDefault();
    const position = this.getPointerPosition(event);
    this.currentDropX = position.x;
    this.isPointerActive = true;
    this.updateDropIndicator();
    this.dropFruit();
  }

  /**
   * 指针离开游戏区域后关闭高亮状态。
   */
  handlePointerLeave() {
    this.isPointerActive = false;
    this.updateDropIndicator();
  }

  /**
   * 将浏览器坐标映射到画布坐标。
   */
  getPointerPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  /**
   * 更新顶部投放指示器位置。
   */
  updateDropIndicator() {
    const fruit = FRUITS[this.nextFruitLevel];
    const x = this.clamp(this.currentDropX, fruit.radius + 8, this.width - fruit.radius - 8);
    const left = (x / this.width) * 100;
    const visible = this.isPointerActive && !this.isGameOver;
    const dropCenterY = this.dangerLineY - fruit.radius - 6;
    const previewPadding = 24;
    const previewSize = fruit.radius * 2 + previewPadding;
    const previewTop = dropCenterY - previewSize / 2;

    this.dropPreviewCanvas.width = previewSize;
    this.dropPreviewCanvas.height = previewSize;
    this.dropPreviewCanvas.style.left = `${left}%`;
    this.dropPreviewCanvas.style.top = `${(previewTop / this.height) * 100}%`;
    this.dropPreviewCanvas.style.width = `${previewSize}px`;
    this.dropPreviewCanvas.style.height = `${previewSize}px`;
    this.dropPreviewCanvas.style.marginLeft = `${-previewSize / 2}px`;
    this.dropPreviewCanvas.style.opacity = visible ? "0.96" : "0.38";

    this.dropPreviewCtx.clearRect(0, 0, this.dropPreviewCanvas.width, this.dropPreviewCanvas.height);
    this.dropPreviewCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawFruit(
      this.dropPreviewCtx,
      this.dropPreviewCanvas.width / 2,
      this.dropPreviewCanvas.height / 2,
      0,
      {
        level: fruit.level,
        radius: fruit.radius,
        color: fruit.color,
        accent: fruit.accent
      },
      false
    );

    this.landingMarker.style.left = `${left}%`;
    this.landingMarker.style.width = `${Math.max(36, fruit.radius * 1.9)}px`;
    this.landingMarker.style.marginLeft = `${-Math.max(18, fruit.radius * 0.95)}px`;
    this.landingMarker.style.opacity = visible ? "0.85" : "0.28";
  }

  /**
   * 更新警戒线在容器中的视觉位置。
   */
  updateDangerLinePosition() {
    const top = (this.dangerLineY / this.height) * 100;
    this.dangerLineElement.style.top = `${top}%`;
  }

  /**
   * 更新顶部文字状态。
   */
  updateStateText() {
    if (this.isGameOver) {
      this.gameStateText.textContent = "已结束";
      return;
    }

    if (this.isPaused) {
      this.gameStateText.textContent = "已暂停";
      return;
    }

    this.gameStateText.textContent = "进行中";
  }

  /**
   * 更新暂停按钮显示文案。
   */
  updatePauseUI() {
    this.pauseButton.textContent = this.isPaused ? "继续" : "暂停";
  }

  /**
   * 控制暂停层和结束层显示。
   */
  updateOverlayVisibility() {
    this.pauseOverlay.classList.toggle("hidden", !this.isPaused || this.isGameOver);
    this.gameOverOverlay.classList.toggle("hidden", !this.isGameOver);
  }

  /**
   * 刷新当前分数字段。
   */
  updateScoreText() {
    this.scoreValue.textContent = String(this.score);
  }

  /**
   * 刷新连击文本。
   */
  updateComboText() {
    this.comboText.textContent = `连击 x${this.combo}`;
    this.comboText.style.opacity = this.combo > 1 ? "1" : "0.72";
  }

  /**
   * 根据连击层级播放顶部文字动画。
   */
  animateComboText(rewardStep) {
    const tier = rewardStep >= 5 ? 3 : rewardStep >= 4 ? 2 : 1;
    const className = `combo-tier-${tier}`;

    this.comboText.classList.remove("combo-tier-1", "combo-tier-2", "combo-tier-3");
    void this.comboText.offsetWidth;
    this.comboText.classList.add(className);
  }

  /**
   * 刷新最高分字段。
   */
  updateBestScoreText() {
    this.bestScoreValue.textContent = String(this.bestScore);
  }

  /**
   * 刷新音效按钮文案。
   */
  updateSoundButtonText() {
    this.soundButton.textContent = this.soundEnabled ? "音效开" : "音效关";
  }

  /**
   * 应用总音量到各个增益节点。
   */
  applyVolume() {
    if (this.masterGain) {
      this.masterGain.gain.value = this.soundEnabled ? 0.22 : 0;
    }

    if (this.musicGain) {
      this.musicGain.gain.value = this.soundEnabled ? 0.14 : 0;
    }

  }

  /**
   * 生成较低等级水果，保证开局和前期节奏更自然。
   */
  getRandomStartFruitLevel() {
    const pool = this.highestUnlockedLevel >= 2
      ? [0, 0, 1, 1, 2]
      : [0, 0, 0, 1];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * 确保音频上下文已创建，并在浏览器允许后恢复播放。
   */
  ensureAudioContext() {
    if (!this.soundEnabled) {
      return null;
    }

    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }

      this.audioContext = new AudioContextClass();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);

      this.musicGain = this.audioContext.createGain();
      this.musicGain.connect(this.masterGain);
      this.applyVolume();
    }

    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    return this.audioContext;
  }

  /**
   * 启动更接近轻松小游戏风格的分段循环背景音乐。
   */
  startBackgroundMusic() {
    if (!this.soundEnabled || this.isPaused || this.isGameOver) {
      return;
    }

    const audioContext = this.ensureAudioContext();
    if (!audioContext || !this.musicGain || this.musicTimerId) {
      return;
    }

    this.musicStepIndex = 0;
    const sections = [
      {
        stepDuration: 0.34,
        lead: [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 587.33],
        harmony: [392, 440, 493.88, 587.33, 493.88, 440, 392, 440],
        bass: [196, 196, 220, 220, 174.61, 174.61, 196, 196]
      },
      {
        stepDuration: 0.38,
        lead: [659.25, 698.46, 783.99, 880, 783.99, 698.46, 659.25, 587.33],
        harmony: [493.88, 523.25, 587.33, 659.25, 587.33, 523.25, 493.88, 440],
        bass: [220, 220, 246.94, 246.94, 196, 196, 174.61, 174.61]
      }
    ];

    const totalSteps = sections.reduce((sum, section) => sum + section.lead.length, 0);

    const scheduleStep = () => {
      if (!this.soundEnabled || this.isPaused || this.isGameOver || !this.audioContext) {
        this.stopBackgroundMusic();
        return;
      }

      let stepCursor = this.musicStepIndex % totalSteps;
      let currentSection = sections[0];

      for (const section of sections) {
        if (stepCursor < section.lead.length) {
          currentSection = section;
          break;
        }
        stepCursor -= section.lead.length;
      }

      const now = this.audioContext.currentTime;
      const stepDuration = currentSection.stepDuration;
      const leadFrequency = currentSection.lead[stepCursor];
      const harmonyFrequency = currentSection.harmony[stepCursor];
      const bassFrequency = currentSection.bass[stepCursor];

      this.playMusicNote(now, stepDuration * 0.92, leadFrequency, "triangle", 0.62, 1800);
      this.playMusicNote(now, stepDuration * 0.88, harmonyFrequency, "sine", 0.3, 1400);
      this.playMusicNote(now, stepDuration * 0.95, bassFrequency, "sine", 0.4, 900);

      if (stepCursor % 2 === 0) {
        this.playMusicNote(now, stepDuration * 0.35, leadFrequency * 2, "triangle", 0.13, 2200);
      }

      this.musicStepIndex += 1;
      this.musicTimerId = window.setTimeout(scheduleStep, stepDuration * 1000);
    };

    scheduleStep();
  }

  /**
   * 停止背景音乐调度与当前残留音符。
   */
  stopBackgroundMusic() {
    if (this.musicTimerId) {
      window.clearTimeout(this.musicTimerId);
      this.musicTimerId = 0;
    }

    for (const oscillator of this.musicOscillators) {
      try {
        oscillator.stop();
      } catch (error) {
        void error;
      }
    }

    this.musicOscillators = [];
  }

  /**
   * 播放背景音乐中的单个音符。
   */
  playMusicNote(startTime, duration, frequency, waveType, gainAmount, filterFrequency) {
    if (!this.audioContext || !this.musicGain) {
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    const stopTime = startTime + duration;

    oscillator.type = waveType;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFrequency, startTime);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(gainAmount, startTime + 0.025);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.musicGain);

    oscillator.start(startTime);
    oscillator.stop(stopTime + 0.02);
    oscillator.onended = () => {
      this.musicOscillators = this.musicOscillators.filter((item) => item !== oscillator);
    };
    this.musicOscillators.push(oscillator);
  }

  /**
   * 统一播放入口，根据事件类型合成简单但清晰的提示音。
   */
  playSound(type, level = 0, strength = 0) {
    const audioContext = this.ensureAudioContext();
    if (!audioContext || !this.masterGain) {
      return;
    }

    switch (type) {
      case "drop":
        this.playDropSound(audioContext);
        break;
      case "merge":
        this.playMergeSound(audioContext, level, strength);
        break;
      case "impact":
        this.playImpactSound(audioContext, level, strength);
        break;
      case "gameover":
        this.playGameOverSound(audioContext);
        break;
      case "toggle-on":
        this.playToggleSound(audioContext);
        break;
      default:
        break;
    }
  }

  /**
   * 连锁奖励音：像消消乐一样，连得越多越兴奋。
   */
  playComboReward(combo, level) {
    if (combo < 3) {
      this.lastComboRewardStep = 2;
      return;
    }

    const audioContext = this.ensureAudioContext();
    if (!audioContext || !this.masterGain) {
      return;
    }

    const rewardStep = Math.min(combo, 8);
    const now = performance.now();
    if (rewardStep === this.lastComboRewardStep && now - this.lastComboRewardAt < 260) {
      return;
    }

    this.lastComboRewardAt = now;
    this.lastComboRewardStep = rewardStep;
    this.animateComboText(rewardStep);
    this.playComboRewardSound(audioContext, rewardStep, level);
  }

  /**
   * 连锁奖励音主体：短促 announcer 感上扬提示。
   */
  playComboRewardSound(audioContext, rewardStep, level) {
    const now = audioContext.currentTime;
    const tier = rewardStep >= 5 ? 3 : rewardStep >= 4 ? 2 : 1;
    const base = 720 + rewardStep * 42 + level * 8;
    const tierConfig = {
      1: {
        wave: "sine",
        noteGap: 0.05,
        duration: 0.095,
        filter: 2300,
        motif: [1, 1.24, 1.52],
        accent: false
      },
      2: {
        wave: "triangle",
        noteGap: 0.045,
        duration: 0.11,
        filter: 2500,
        motif: [1, 1.14, 1.38, 1.68],
        accent: true
      },
      3: {
        wave: "triangle",
        noteGap: 0.04,
        duration: 0.125,
        filter: 2750,
        motif: [1, 1.18, 1.42, 1.72, 2.02],
        accent: true
      }
    };
    const config = tierConfig[tier];

    config.motif.forEach((ratio, index) => {
      const startTime = now + index * config.noteGap;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      const frequency = base * ratio;
      const peak = Math.max(0.055, 0.085 + tier * 0.018 - index * 0.006);

      oscillator.type = config.wave;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * (tier === 3 ? 1.06 : 1.04), startTime + config.duration * 0.65);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(config.filter + rewardStep * 90, startTime);
      filter.Q.value = tier === 1 ? 0.8 : 1.05;

      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.exponentialRampToValueAtTime(peak, startTime + 0.008);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + config.duration);

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.masterGain);

      oscillator.start(startTime);
      oscillator.stop(startTime + config.duration + 0.02);
    });

    if (config.accent) {
      const sparkle = audioContext.createOscillator();
      const sparkleGain = audioContext.createGain();
      const sparkleFilter = audioContext.createBiquadFilter();

      sparkle.type = tier === 3 ? "sine" : "triangle";
      sparkle.frequency.setValueAtTime(base * (tier === 3 ? 2.28 : 2.05), now + 0.02);
      sparkle.frequency.exponentialRampToValueAtTime(base * (tier === 3 ? 2.62 : 2.34), now + 0.16);

      sparkleFilter.type = "bandpass";
      sparkleFilter.frequency.setValueAtTime(2700 + tier * 180, now);
      sparkleFilter.Q.value = tier === 3 ? 1.8 : 1.4;

      sparkleGain.gain.setValueAtTime(0.0001, now + 0.02);
      sparkleGain.gain.exponentialRampToValueAtTime(tier === 3 ? 0.055 : 0.04, now + 0.04);
      sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      sparkle.connect(sparkleFilter);
      sparkleFilter.connect(sparkleGain);
      sparkleGain.connect(this.masterGain);

      sparkle.start(now + 0.02);
      sparkle.stop(now + 0.2);
    }
  }

  /**
   * 投放音效：短促下落提示。
   */
  playDropSound(audioContext) {
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(320, now + 0.08);

    filter.type = "lowpass";
    filter.frequency.value = 1600;

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.start(now);
    oscillator.stop(now + 0.11);
  }

  /**
   * 合成音效：根据水果等级切换专属音色，并叠加短旋律 motif。
   */
  playMergeSound(audioContext, level, combo = 1) {
    const now = audioContext.currentTime;
    const baseFrequency = 500 * Math.pow(1.082, level);
    const profiles = [
      { wave: "sine", filter: 2600, ratios: [1, 1.25], volume: 0.09, decay: 0.16 },
      { wave: "triangle", filter: 2500, ratios: [1, 1.2], volume: 0.1, decay: 0.18 },
      { wave: "triangle", filter: 2300, ratios: [1, 1.16, 1.4], volume: 0.11, decay: 0.18 },
      { wave: "square", filter: 1800, ratios: [1, 1.12], volume: 0.085, decay: 0.14 },
      { wave: "triangle", filter: 2800, ratios: [1, 1.33], volume: 0.1, decay: 0.15 },
      { wave: "sine", filter: 2100, ratios: [1, 1.5], volume: 0.11, decay: 0.2 },
      { wave: "triangle", filter: 2400, ratios: [1, 1.25, 1.5], volume: 0.115, decay: 0.22 },
      { wave: "square", filter: 1500, ratios: [1, 1.19, 1.42], volume: 0.09, decay: 0.16 },
      { wave: "square", filter: 900, ratios: [0.75, 1, 1.12], volume: 0.08, decay: 0.24 },
      { wave: "sawtooth", filter: 700, ratios: [0.5, 0.75, 1], volume: 0.095, decay: 0.28 }
    ];
    const profile = profiles[Math.min(level, profiles.length - 1)];

    profile.ratios.forEach((ratio, index) => {
      const startTime = now + index * 0.032;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      const frequency = baseFrequency * ratio;
      const peakGain = Math.max(0.08, profile.volume + 0.03 - index * 0.01 + Math.min(combo, 6) * 0.008);
      const stopTime = startTime + profile.decay;

      oscillator.type = profile.wave;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * (level >= 8 ? 1.04 : 1.12), startTime + profile.decay * 0.45);

      filter.type = level >= 8 ? "bandpass" : "lowpass";
      filter.frequency.setValueAtTime(profile.filter + level * 80, startTime);
      filter.Q.value = level >= 8 ? 1.8 : 0.6;

      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.masterGain);

      oscillator.start(startTime);
      oscillator.stop(stopTime + 0.02);
    });

    if (level === 8 || level === 9) {
      const thumpOscillator = audioContext.createOscillator();
      const thumpGain = audioContext.createGain();
      const thumpFilter = audioContext.createBiquadFilter();

      thumpOscillator.type = "sine";
      thumpOscillator.frequency.setValueAtTime(level === 8 ? 120 : 90, now);
      thumpOscillator.frequency.exponentialRampToValueAtTime(level === 8 ? 70 : 55, now + 0.18);

      thumpFilter.type = "lowpass";
      thumpFilter.frequency.setValueAtTime(level === 8 ? 500 : 420, now);

      thumpGain.gain.setValueAtTime(0.0001, now);
      thumpGain.gain.exponentialRampToValueAtTime(level === 8 ? 0.06 : 0.08, now + 0.015);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      thumpOscillator.connect(thumpFilter);
      thumpFilter.connect(thumpGain);
      thumpGain.connect(this.masterGain);

      thumpOscillator.start(now);
      thumpOscillator.stop(now + 0.22);
    }

    this.playMergeMotif(audioContext, level, baseFrequency);
  }

  /**
   * 碰撞音效：轻微咚/啵声，按冲击强度与水果大小变化。
   */
  playImpactSound(audioContext, level, strength) {
    const now = audioContext.currentTime;
    const clampedStrength = this.clamp(strength, 1.6, 8);
    const isHeavy = level >= 7;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    oscillator.type = isHeavy ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(isHeavy ? 180 - level * 8 : 260 + level * 18, now);
    oscillator.frequency.exponentialRampToValueAtTime(isHeavy ? 90 - level * 3 : 170 + level * 8, now + 0.08);

    filter.type = isHeavy ? "lowpass" : "bandpass";
    filter.frequency.setValueAtTime(isHeavy ? 700 : 1200 + level * 60, now);
    filter.Q.value = isHeavy ? 0.8 : 1.5;

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.012 + clampedStrength * 0.008, now + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (isHeavy ? 0.13 : 0.09));

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.start(now);
    oscillator.stop(now + (isHeavy ? 0.14 : 0.1));
  }

  /**
   * 为不同水果等级播放短旋律标识，越高级越有记忆点。
   */
  playMergeMotif(audioContext, level, baseFrequency) {
    const motifs = [
      [1.18],
      [1, 1.2],
      [1, 1.16, 1.32],
      [1, 1.12],
      [1, 1.26],
      [1, 1.2, 1.5],
      [1, 1.25, 1.5],
      [1, 1.12, 1.42],
      [0.82, 1, 1.12],
      [0.75, 0.94, 1.26, 1.5]
    ];
    const motif = motifs[Math.min(level, motifs.length - 1)];

    motif.forEach((ratio, index) => {
      const startTime = audioContext.currentTime + 0.02 + index * 0.055;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      const frequency = baseFrequency * ratio;
      const duration = level >= 8 ? 0.12 : 0.09;

      oscillator.type = level >= 9 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.03, startTime + duration * 0.6);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(level >= 8 ? 1500 : 2200, startTime);

      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.exponentialRampToValueAtTime(level >= 8 ? 0.05 : 0.04, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.masterGain);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.02);
    });
  }

  /**
   * 结束音效：明显下降的提示音。
   */
  playGameOverSound(audioContext) {
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(330, now);
    oscillator.frequency.exponentialRampToValueAtTime(140, now + 0.45);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.45);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.start(now);
    oscillator.stop(now + 0.52);
  }

  /**
   * 音效开启时播放轻提示，给用户即时反馈。
   */
  playToggleSound(audioContext) {
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.08);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.start(now);
    oscillator.stop(now + 0.11);
  }

  /**
   * 销毁旧的 Matter 世界和动画状态，避免内存泄漏。
   */
  destroyWorld() {
    this.stopBackgroundMusic();

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }

    if (this.runner) {
      Runner.stop(this.runner);
      this.runner = null;
    }

    if (this.engine && this.boundCollisionStart) {
      Events.off(this.engine, "collisionStart", this.boundCollisionStart);
      this.boundCollisionStart = null;
    }

    if (this.engine && this.boundCollisionActive) {
      Events.off(this.engine, "collisionActive", this.boundCollisionActive);
      this.boundCollisionActive = null;
    }

    this.pendingMergePairs.clear();
    this.mergeGlowFruitIds.clear();
    this.mergePairCooldown.clear();

    if (this.world) {
      Composite.clear(this.world, false);
      this.world = null;
    }

    if (this.engine) {
      Engine.clear(this.engine);
      this.engine = null;
    }

    this.fruits = [];
    this.mergeEffects = [];
  }

  /**
   * 数值钳制工具函数。
   */
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
}

window.addEventListener("load", () => {
  new FruitMergeGame();
});
