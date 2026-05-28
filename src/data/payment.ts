/**
 * @file src/data/payment.ts
 * @description 付费场景配置。
 */

/* ------------------------- payConfigs（保留你的原始内容） ------------------------- */
export interface PayConfig {
  chatId: number;
  threadIds?: number[];
  placeName?: string;
  enabled?: boolean;
  successMessage?: string;
}

export const payConfigs: PayConfig[] = [
  {
    chatId: -1002970430696,
    threadIds: [177],
    placeName: "天狐宫的祈愿箱",
    enabled: true,
    successMessage:
      "${userName}将 ${amount} 💰投入${place}." +
      "<blockquote expandable>铜钱在掌心里带着一丝凉意，双手合握着硬币，轻轻投下。铜钱落下时撞击木格的声响，清脆而短促，细微的回音在殿内回荡，彷佛整座神社都听见了他的愿望，像是把心意托付给神明的回应。"
      + "拉动铃绳，铃铛随着力道震颤，清冽而悠长，声音化作无形的狐鸣，穿梭于屋檐与杉木林间。双手在胸前合十，闭眼低首。两次轻拍掌声回响，像是驱散尘世之音，也像是在召唤守护此地的狐灵。"
      + "心跳与手心的温度，似乎与远处的狐火呼应，燃成一点点无形的光。最后，再次深深鞠躬，感受到自己也被那无形的狐影注视着。临走时，不起眼的小狐灵悄悄的跟了过去守护着。</blockquote>"
      + "${place}现已累积 ${total} 💰。"
  },
  {
    chatId: -1002970430696,
    threadIds: [178],
    placeName: "紫罗兰教堂的募捐箱",
    enabled: true,
    successMessage:
      "${userName}已将 ${amount} 💰投入${place}." +
      "<blockquote expandable>信徒手中握紧了硬币，在胸前虔诚地画下了十字，然后将它们投进了募捐箱中。硬币落于箱底，发出了清脆的声响。信徒合十之后的祈祷，和空气中若有若无的圣歌，相得益彰。烛台的火苗，忽然爆起，发出了噼啪声。\n\n"
      + "神像的目光，宽任怜恤，看向了虔敬的信徒。温暖的阳光，穿过了彩色的玻璃窗，聚焦于信徒的头顶，仿佛亮起了一道神明降下的视线，久久不曾离开。\n\n"
      + "祈祷声渐歇，光影抖动着、跳跃着。空中似乎浮现出天使之手，撒下了无数的紫罗兰花瓣，在神明的注视下，伴随着信徒坚定的步履，一路飘落，向前。</blockquote>"
      + "${place}现已累计收到 ${total} 💰的捐款。感谢您的善助。"
  },
  {
    chatId: -1002848481881,
    threadIds: [66],
    placeName: "紫罗兰教堂的募捐箱",
    enabled: true,
    successMessage:
      "${userName}已将 ${amount} 💰投入${place}." +
      "<blockquote expandable>信徒手中握紧了硬币，在胸前虔诚地画下了十字，然后将它们投进了募捐箱中。硬币落于箱底，发出了清脆的声响。信徒合十之后的祈祷，和空气中若有若无的圣歌，相得益彰。烛台的火苗，忽然爆起，发出了噼啪声。"
      + "神像的目光，宽任怜恤，看向了虔敬的信徒。温暖的阳光，穿过了彩色的玻璃窗，聚焦于信徒的头顶，仿佛亮起了一道神明降下的视线，久久不曾离开。"
      + "祈祷声渐歇，光影抖动着、跳跃着。空中似乎浮现出天使之手，撒下了无数的紫罗兰花瓣，在神明的注视下，伴随着信徒坚定的步履，一路飘落，向前。</blockquote>"
      + "${place}现已累积收到 ${total} 💰的捐款。感谢您的善助。"
  }
];
