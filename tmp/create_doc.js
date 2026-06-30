const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType } = require("docx");
const fs = require("fs");

async function main() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "微软雅黑", size: 24 },
          paragraph: { spacing: { after: 200 } }
        }
      }
    },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        new Paragraph({
          text: "开题答辩录音稿——各说话人意见详细总结",
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),
        infoPara("会议主题：结直肠癌中DELE1蛋白通过内质网相关降解（ERAD）通路及棕榈酰化修饰调控肿瘤进展的开题汇报与专家评议"),
        infoPara("会议时间：2026-06-25 09:49:23"),
        new Paragraph({ spacing: { after: 400 } }),

        // ============ 潘林杰 ============
        sectionHeader("一、潘林杰（汇报学生）"),
        para("潘林杰系统汇报了自己的开题研究，主要陈述内容包括："),
        bullet("选题依据", "以结直肠癌为背景，聚焦内质网相关降解（ERAD）通路。从内质网应激（ERS）入手，因肿瘤细胞高度依赖蛋白质稳态，而ERAD是缓解ERS的核心机制。"),
        bullet("靶点筛选策略", "整合TCGA、CPTAC及本中心肠癌蛋白组数据，取\u201c肿瘤中高表达\u201d与\u201cGO注释富集于ERAD通路\u201d的交集，初筛得DERLIN-1（DY/D2Y/DELE1）、MANEA、BCAP31三个候选分子；经预后生存分析最终锁定DERLIN-1。"),
        bullet("功能验证", "在LOVO细胞中敲低DY、HT-29中过表达DY，结合CCK-8、平板克隆、流式凋亡、裸鼠成瘤实验，证实DY促进增殖、抑制凋亡、加速肿瘤生长。敲低DY后内质网应激标志物（CHOP、BiP）上调，提示DY可能通过缓解ERS促癌。"),
        bullet("上游调控机制", "通过DY的免疫共沉淀（IP）联合质谱分析检出ZDHHC4，提出\u201cZDHHC4介导的棕榈酰化修饰调控DY功能\u201d假说，初步验证ZDHHC4过表达可提升DY棕榈酰化水平。"),
        bullet("研究计划", "四阶段推进：\u2460完善DY促癌机制与回复实验；\u2461DY对肿瘤微环境影响；\u2462鉴定DY棕榈酰化位点及其对ERAD功能的调控；\u2463ZDHHC4-DY互作机制研究。"),

        // ============ 主任 ============
        sectionHeader("二、主任"),
        para("主任是会上最重要的评议人之一，主要意见："),
        bullet("逻辑严密性", "强调课题必须聚焦科学问题的逻辑严密性，反对泛泛而谈或堆砌技术路线。要求厘清\u201c为什么研究D2Y\u201d这一根本前提。"),
        bullet("临床转化价值", "指出ED通路研究应明确其在肠癌中的具体作用机制、干预靶点及与免疫治疗等临床应用的关联。质问\u201c我们在临床上面能不能有机会去运用？能起到什么样的作用？\u201d"),
        bullet("创新切入点", "督促深入挖掘创新切入点以支撑课题可行性。建议思考DY与免疫治疗结合的可能性，如DY高表达能否预测免疫治疗疗效、影响肿瘤微环境中免疫细胞浸润。"),
        bullet("题目具体化", "指出课题题目应具体化，不能笼统说\u201c研究ED在肠癌中的作用\u201d，强调题目要聚焦，要有具体科学问题。"),
        bullet("文献支撑", "指出从ERAD突然跳到DY/ZDHHC4的逻辑链缺少文献支撑，\u201c感觉这个东西突然一下就冒出来\u201d。"),
        bullet("开题的本质", "提醒开题的核心是逻辑自洽和初步证据支撑，研究过程中可能调整方向是正常的。\u201c按照这个上面做，做了以后说不定就废掉了，做不下去了，重新换了。\u201d——这是正常科研过程。"),

        // ============ 说话人3 ============
        sectionHeader("三、说话人3"),
        bullet("关键建议", "建议优先在肠癌细胞或临床样本中直接检测ZDHHC4是否真实存在棕榈酰化修饰。"),
        bullet("逻辑警示", "强调应以实证修饰状态为前提再开展后续机制探索，避免逻辑倒置导致研究基础不牢。"),

        // ============ 说话人4 ============
        sectionHeader("四、说话人4"),
        bullet("逻辑衔接问题", "指出汇报中从内质网应激过渡到D2Y筛选的过程衔接生硬，缺乏自然逻辑链条。"),
        bullet("可视化建议", "建议补充筛选图示细节以阐明选择依据。"),
        bullet("文献与数据库", "提示当前研究在数据库支持和文献覆盖方面尚显薄弱。"),
        bullet("追问", "参与追问潘林杰关于IP-MS实验是自行完成还是数据库数据。"),

        // ============ 说话人5 ============
        sectionHeader("五、说话人5"),
        bullet("多组学整合", "提出应在肠癌背景下整合转录组与蛋白组数据。"),
        bullet("功能验证方向", "建议系统分析D2Y敲除或修饰后下游功能变化，验证其生物学效应是否与其已知ERAD功能一致，从而增强后续实验设计的靶向性与说服力。"),

        // ============ 说话人6 ============
        sectionHeader("六、说话人6"),
        para("文档标注\u201c暂未识别到明确的信息或观点\u201d，未形成有效评议意见。"),

        // ============ 说话人7 ============
        sectionHeader("七、说话人7"),
        bullet("标题具象化", "强调标题需具象化至具体分子（如D2Y）。"),
        bullet("PPT规范", "指出PPT中实验图像缺失比例尺、文献引用不规范、棕榈酰化背景介绍顺序不当等问题。"),
        bullet("叙述逻辑", "主张调整叙述逻辑以提升科学表达的连贯性与专业性。"),

        // ============ 说话人8 ============
        sectionHeader("八、说话人8"),
        bullet("参考文献", "认为PPT参考文献数量偏少。"),
        bullet("筛选数据展示", "建议突出展示三个候选基因的筛选结果与差异分析图表。"),
        bullet("逻辑表达", "建议优化D2Y引出过程的逻辑表述，补充其功能定位与研究必要性的深度阐释以增强论证厚度。"),

        // ============ 说话人9 ============
        sectionHeader("九、说话人9"),
        bullet("研究起点质疑", "质疑研究起点的合理性，追问为何聚焦D2Y而非其他ERAD组分——\u201c你自己有没有办法完全让自己很有信心地做下去？\u201d"),
        bullet("IP-MS作为起点", "强调需基于已有证据（如IP-MS拉取ZDHHC4）构建可信逻辑链，建议将IP-MS数据作为研究起点。"),
        bullet("开题核心", "指出开题核心在于逻辑自洽与初步证据支撑，而非追求技术全面性。"),
        bullet("追问经验", "追问潘林杰是否自己做过相关研究、有无师兄做过类似方向。"),
        bullet("逻辑链持续追问", "持续参与追问筛选逻辑和数据来源，帮助梳理论证路径。"),

        // ============ 说话人10 ============
        sectionHeader("十、说话人10"),
        bullet("ERAD依赖性验证", "指出应优先验证D2Y功能是否依赖ERAD通路。"),
        bullet("挽救实验", "建议使用ERAD抑制剂进行功能挽救实验以确立因果关系。"),
        bullet("研究顺序", "强调在确认该前提前不宜急于推进上游修饰研究。"),
        bullet("基础规范", "提醒补充课题命名与文献格式等基础规范。"),

        // ============ 说话人11 ============
        sectionHeader("十一、说话人11"),
        bullet("细胞对照", "建议在细胞实验中增设正常结肠上皮细胞对照。"),
        bullet("棕榈酰化引入", "指出棕榈酰化部分引入突兀，宜补充其与内质网应激关联的既有研究佐证，以增强该环节的科学合理性。"),

        // ============ 说话人12 ============
        sectionHeader("十二、说话人12"),
        bullet("质谱数据审查", "提醒关注ZDHHC4质谱鉴定结果的丰度分布均匀性。"),
        bullet("靶点可靠性", "建议复核是否存在更高丰度的潜在互作蛋白，以保障靶点选择的可靠性。"),

        // ============ 说话人13 ============
        sectionHeader("十三、说话人13"),
        bullet("量化评估指标", "提出ERAD作为核心通路需建立可量化的评估指标。"),
        bullet("系统分析", "建议系统分析ERAD在肠癌组织中的整体活性水平，并关联下游基因变化，以夯实机制研究的基础维度。"),

        // ============ 说话人14 ============
        sectionHeader("十四、说话人14"),
        bullet("多重验证", "强调必须首先在人群队列、单细胞层面及ERAD功能维度完成D2Y表达与活性的多重验证。"),
        bullet("实验确证", "指出公共数据筛选结论须经实验反向确证。"),
        bullet("反对跳跃", "反对跳过基础验证直接进入修饰机制研究，要求补全筛选逻辑闭环与数据支撑体系。"),
        bullet("汇报内容量", "指出汇报内容偏少——\u201c感觉你这一年可能没什么太多的东西，随便拿个东西来汇报\u201d——建议内容尽量丰满。"),
        bullet("逻辑补充", "与说话人9一起追问筛选逻辑，建议棕榈酰化部分不要\u201c生硬地直接跳入\u201d。"),

        // ============ 说话人15 ============
        sectionHeader("十五、说话人15"),
        bullet("ERAD功能评估缺口", "聚焦ERAD功能评估的技术缺口，指出需建立逆向转运效率、复合体稳定性等特异性检测指标。"),
        bullet("环节不明确", "质疑当前研究未界定D2Y作用的具体环节——是影响逆向转运复合体的稳定性，还是影响底物转运效率？\u201c到底是哪一个环节，你不知道对吧。\u201d"),
        bullet("前沿方向拓展", "提出核蛋白降解这一前沿方向——\u201c内质网跟核之间会不会也有类似的通道？核蛋白质怎么降解？这非常有意义。\u201d建议由此提升课题科学价值。"),
        bullet("组学鉴定策略", "建议通过组学技术系统鉴定被DY调控转运的膜蛋白，而非仅关注修饰本身。"),
        bullet("优先级判断", "强调ERAD功能评估比棕榈酰化更直接、更关键。"),

        // ============ 总体评价 ============
        sectionHeader("十六、总体评价与核心共识"),
        para("综合所有评议人的意见，主要指向以下几个关键改进方向："),

        new Table({
          rows: [
            new TableRow({
              children: [
                cellH("维度"),
                cellH("核心建议"),
              ]
            }),
            new TableRow({
              children: [
                cellB("逻辑链条"),
                cellT("必须先验证DY功能是否依赖ERAD通路（使用ERAD抑制剂/功能检测试剂盒），再谈上游修饰"),
              ]
            }),
            new TableRow({
              children: [
                cellB("靶点验证"),
                cellT("所有公共数据库筛选靶点须经临床样本+细胞模型双重验证"),
              ]
            }),
            new TableRow({
              children: [
                cellB("修饰研究前置条件"),
                cellT("ZDHHC4-DY棕榈酰化轴需前置充分依据，目前证据薄弱不可作为核心主线"),
              ]
            }),
            new TableRow({
              children: [
                cellB("科学问题聚焦"),
                cellT("需将宽泛的\u201c研究ED在肠癌中的作用\u201d具象化为具体机制问题"),
              ]
            }),
            new TableRow({
              children: [
                cellB("呈现规范"),
                cellT("PPT缺失课题标题、比例尺、文献引用格式不规范、内容偏少"),
              ]
            }),
            new TableRow({
              children: [
                cellB("创新性"),
                cellT("建议探索核蛋白降解等前沿方向以提升课题科学价值"),
              ]
            }),
          ]
        }),

        new Paragraph({ spacing: { after: 400 } }),

        new Paragraph({
          children: [new TextRun({ text: "\u2014 文档完 \u2014", size: 20, italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 }
        }),
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = "C:\\Users\\86132\\Desktop\\2026~2029\\科研\\研一开题\\开题答辩_各说话人意见总结.docx";
  fs.writeFileSync(outPath, buffer);
  console.log("Done: " + outPath);
}

function sectionHeader(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, font: "微软雅黑" })],
    spacing: { before: 400, after: 200 },
    shading: { type: ShadingType.CLEAR, color: "D9E2F3", fill: "D9E2F3" }
  });
}

function para(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: "微软雅黑" })],
    spacing: { after: 150 }
  });
}

function infoPara(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: "微软雅黑" })],
    spacing: { after: 100 }
  });
}

function bullet(label, text) {
  return new Paragraph({
    spacing: { after: 120 },
    indent: { left: 400 },
    children: [
      new TextRun({ text: "\u2022 " + label + "\uff1a", bold: true, size: 22, font: "微软雅黑" }),
      new TextRun({ text: text, size: 22, font: "微软雅黑" }),
    ]
  });
}

function cellH(text) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: 20, font: "微软雅黑" })],
      spacing: { before: 60, after: 60 }
    })],
    width: { size: 2800, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "D9E2F3", fill: "D9E2F3" }
  });
}

function cellB(text) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: 20, font: "微软雅黑" })],
      spacing: { before: 60, after: 60 }
    })],
    width: { size: 2800, type: WidthType.DXA },
  });
}

function cellT(text) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, size: 20, font: "微软雅黑" })],
      spacing: { before: 60, after: 60 }
    })],
    width: { size: 7000, type: WidthType.DXA },
  });
}

main().catch(console.error);
