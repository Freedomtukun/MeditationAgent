/**
 * 冥想引导 Prompt 生成器
 * 根据主题、风格、时长等参数构建适合的大模型提示词
 */

const fs = require('fs');
const path = require('path');

// 加载冥想主题配置
const meditationTypes = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../prompts/meditation_types.json'),
    'utf-8'
  )
);

class MeditationPromptBuilder {
  constructor() {
    // 从配置文件加载主题和风格
    this.meditationConfig = meditationTypes;
    
    // 基础模板配置
    this.templates = {
      zh: {
        systemRole: '你是一位经验丰富的冥想引导师，擅长用温和、平静的语言引导练习者进入深度放松状态。',
        constraints: {
          tone: '语气温和、节奏缓慢、充满关怀',
          structure: '包含开场引导、主体练习、结束回归三个部分',
          language: '使用简单易懂的语言，避免专业术语',
          timing: '适当留白，给练习者充分的感受时间'
        }
      },
      en: {
        systemRole: 'You are an experienced meditation guide, skilled in using gentle and calm language to guide practitioners into deep relaxation.',
        constraints: {
          tone: 'Gentle, slow-paced, caring',
          structure: 'Include opening guidance, main practice, and closing return',
          language: 'Use simple, accessible language, avoid jargon',
          timing: 'Include appropriate pauses for practitioners to experience'
        }
      }
    };

    // 从配置文件获取风格映射
    this.styleMap = {};
    Object.entries(this.meditationConfig.styleDefinitions).forEach(([key, value]) => {
      this.styleMap[key] = value.zh;
    });

    // 时长描述映射
    this.durationMap = {
      5: '简短练习（约5分钟）',
      10: '标准练习（约10分钟）',
      15: '深度练习（约15分钟）',
      20: '完整练习（约20分钟）'
    };
  }

  /**
   * 构建冥想引导的 Prompt
   * @param {Object} params - 参数对象
   * @param {string} params.topic - 冥想主题（如：助眠、缓解焦虑、身体扫描等）
   * @param {string} params.style - 引导风格（如：gentle、healing、mindful等）
   * @param {number} params.duration - 时长（分钟，默认10）
   * @param {string} params.language - 语言（zh/en，默认zh）
   * @param {Object} params.customization - 自定义参数（可选）
   * @returns {string} 构建好的 prompt 字符串
   */
  buildPrompt({ 
    topic = '基础放松', 
    style = 'gentle', 
    duration = 10, 
    language = 'zh',
    customization = {}
  }) {
    // 从配置中查找主题（支持ID、中文名、英文名查询）
    const topicConfig = this._findTopicConfig(topic);
    
    // 如果找到配置，使用配置中的默认值
    if (topicConfig) {
      style = style || topicConfig.recommendedStyles[0];
      duration = duration || topicConfig.defaultDuration;
    }
    
    const template = this.templates[language] || this.templates.zh;
    const styleName = this.styleMap[style] || style;
    const durationDesc = this.durationMap[duration] || `约${duration}分钟`;

    // 构建主要指令
    const mainInstruction = this._buildMainInstruction(topic, styleName, durationDesc, language, topicConfig);
    
    // 构建约束条件
    const constraints = this._buildConstraints(template.constraints, customization, topicConfig);
    
    // 构建输出格式要求
    const outputFormat = this._buildOutputFormat(duration, language);

    // 组装完整 prompt
    const prompt = `
${template.systemRole}

【任务要求】
${mainInstruction}

【引导原则】
${constraints}

【输出格式】
${outputFormat}

【特殊要求】
${this._buildSpecialRequirements(topic, customization, language, topicConfig)}

请生成冥想引导词：`.trim();

    return prompt;
  }

  /**
   * 查找主题配置
   */
  _findTopicConfig(topic) {
    return this.meditationConfig.types.find(t => 
      t.id === topic || 
      t.name.zh === topic || 
      t.name.en === topic ||
      t.keywords.includes(topic)
    );
  }

  /**
   * 构建主要指令
   */
  _buildMainInstruction(topic, style, duration, language, topicConfig) {
    // 如果有配置，使用配置中的描述
    const topicName = topicConfig ? topicConfig.name[language] : topic;
    const description = topicConfig ? topicConfig.description[language] : '';
    
    if (language === 'zh') {
      const instruction = `请为「${topicName}」主题创建一段${style}风格的冥想引导词，时长${duration}。`;
      return description ? `${instruction}\n主题说明：${description}` : instruction;
    } else {
      const instruction = `Please create a ${style} style meditation guidance for "${topicName}", duration ${duration}.`;
      return description ? `${instruction}\nTheme description: ${description}` : instruction;
    }
  }

  /**
   * 构建约束条件
   */
  _buildConstraints(templateConstraints, customization, topicConfig) {
    const constraints = [];
    
    // 添加模板约束
    Object.entries(templateConstraints).forEach(([key, value]) => {
      constraints.push(`- ${value}`);
    });
    
    // 如果有主题配置，添加目标人群和益处信息
    if (topicConfig) {
      const language = 'zh'; // 默认使用中文，可以作为参数传入
      if (topicConfig.targetAudience && topicConfig.targetAudience[language]) {
        constraints.push(`- 适合人群：${topicConfig.targetAudience[language].join('、')}`);
      }
      if (topicConfig.benefits && topicConfig.benefits[language]) {
        constraints.push(`- 练习益处：${topicConfig.benefits[language].join('、')}`);
      }
    }
    
    // 添加自定义约束
    if (customization.additionalConstraints) {
      customization.additionalConstraints.forEach(constraint => {
        constraints.push(`- ${constraint}`);
      });
    }
    
    return constraints.join('\n');
  }

  /**
   * 构建输出格式要求
   */
  _buildOutputFormat(duration, language) {
    const formatRequirements = language === 'zh' ? [
      '1. 开场引导（1-2分钟）：帮助练习者放松身心，进入冥想状态',
      '2. 主体练习（根据主题展开）：核心引导内容',
      '3. 结束回归（1分钟）：温和地引导练习者回到当下',
      '4. 使用"..."表示停顿，给练习者留出感受的时间',
      '5. 每个段落控制在2-3句话，保持节奏舒缓'
    ] : [
      '1. Opening guidance (1-2 minutes): Help practitioners relax and enter meditation',
      '2. Main practice (based on theme): Core guidance content',
      '3. Closing return (1 minute): Gently guide practitioners back to present',
      '4. Use "..." to indicate pauses for practitioners to experience',
      '5. Keep each paragraph to 2-3 sentences for gentle pacing'
    ];

    return formatRequirements.join('\n');
  }

  /**
   * 构建特殊要求
   */
  _buildSpecialRequirements(topic, customization, language, topicConfig) {
    const requirements = [];
    
    // 首先尝试从配置中获取特殊要求
    if (topicConfig) {
      // 添加技巧相关要求
      if (topicConfig.techniques) {
        const techniqueText = language === 'zh' 
          ? `建议使用技巧：${topicConfig.techniques.join('、')}`
          : `Suggested techniques: ${topicConfig.techniques.join(', ')}`;
        requirements.push(techniqueText);
      }
      
      // 添加最佳时间建议
      if (topicConfig.bestTime) {
        const timeText = language === 'zh'
          ? `最佳练习时间：${topicConfig.bestTime.join('、')}`
          : `Best practice time: ${topicConfig.bestTime.join(', ')}`;
        requirements.push(timeText);
      }
      
      // 添加进阶步骤
      if (topicConfig.progression) {
        const progressionText = language === 'zh'
          ? `引导顺序：${topicConfig.progression.join(' → ')}`
          : `Guidance sequence: ${topicConfig.progression.join(' → ')}`;
        requirements.push(progressionText);
      }
    }
    
    // 如果配置中没有找到，尝试使用硬编码的特殊要求
    const hardcodedRequirements = this._getTopicSpecificRequirements(topic, language);
    if (hardcodedRequirements && !topicConfig) {
      requirements.push(hardcodedRequirements);
    }
    
    // 添加自定义特殊要求
    if (customization.specialRequirements) {
      requirements.push(...customization.specialRequirements);
    }
    
    // 如果没有特殊要求，返回默认提示
    if (requirements.length === 0) {
      return language === 'zh' ? '无特殊要求' : 'No special requirements';
    }
    
    return requirements.join('\n');
  }

  /**
   * 获取主题相关的特殊要求
   */
  _getTopicSpecificRequirements(topic, language) {
    const topicMap = {
      zh: {
        '助眠': '- 使用更加缓慢、轻柔的语调\n- 引导想象舒适、安全的环境\n- 逐步放松身体各个部位',
        '缓解焦虑': '- 强调呼吸的重要性\n- 引导觉察但不评判当下的感受\n- 培养内在的平静与接纳',
        '身体扫描': '- 从头到脚或从脚到头系统引导\n- 每个部位停留适当时间\n- 鼓励觉察而非改变',
        '慈心冥想': '- 从自己开始，逐步扩展到他人\n- 使用温暖、充满爱的语言\n- 培养慈悲与善意',
        '呼吸冥想': '- 详细引导呼吸的观察\n- 可以加入数息练习\n- 强调自然、不强迫'
      },
      en: {
        'sleep': '- Use slower, gentler tone\n- Guide visualization of comfortable, safe environment\n- Progressive body relaxation',
        'anxiety relief': '- Emphasize importance of breathing\n- Guide awareness without judgment\n- Cultivate inner calm and acceptance',
        'body scan': '- Systematic guidance from head to toe or toe to head\n- Appropriate pause for each body part\n- Encourage awareness rather than change',
        'loving-kindness': '- Start with self, gradually extend to others\n- Use warm, loving language\n- Cultivate compassion and kindness',
        'breath meditation': '- Detailed guidance on breath observation\n- Can include counting breaths\n- Emphasize natural, non-forced breathing'
      }
    };

    return topicMap[language]?.[topic] || null;
  }

  /**
   * 获取支持的主题列表（从配置文件动态获取）
   */
  getSupportedTopics(language = 'zh') {
    return this.meditationConfig.types.map(type => type.name[language]);
  }

  /**
   * 获取支持的风格列表
   */
  getSupportedStyles() {
    return Object.keys(this.meditationConfig.styleDefinitions);
  }
  
  /**
   * 获取主题详细信息
   */
  getTopicDetails(topic, language = 'zh') {
    const topicConfig = this._findTopicConfig(topic);
    if (!topicConfig) return null;
    
    return {
      id: topicConfig.id,
      name: topicConfig.name[language],
      description: topicConfig.description[language],
      recommendedStyles: topicConfig.recommendedStyles,
      defaultDuration: topicConfig.defaultDuration,
      targetAudience: topicConfig.targetAudience[language],
      benefits: topicConfig.benefits[language],
      keywords: topicConfig.keywords
    };
  }
  
  /**
   * 根据用户需求推荐主题
   */
  recommendTopics(needs, language = 'zh') {
    const recommendations = [];
    
    // 根据关键词匹配主题
    this.meditationConfig.types.forEach(type => {
      const matchScore = needs.reduce((score, need) => {
        return score + (type.keywords.includes(need) ? 1 : 0);
      }, 0);
      
      if (matchScore > 0) {
        recommendations.push({
          topic: type.name[language],
          id: type.id,
          score: matchScore,
          reason: type.benefits[language].slice(0, 2).join('、')
        });
      }
    });
    
    // 按匹配度排序
    return recommendations.sort((a, b) => b.score - a.score);
  }
}

// 导出单例实例
module.exports = new MeditationPromptBuilder();