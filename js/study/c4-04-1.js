/* 自學樣品內容：33 項校正；物理運算沿用 InclineCore。 */
(function(root){
  'use strict';
  const data={
  "id": "c4-04-1",
  "title": [
    "靜摩擦力會跟著外力變",
    "Static friction follows the pull"
  ],
  "board": [
    [
      "未滑動：\\(f_s=F\\)，大小相等、方向相反。",
      "At rest: \\(f_s=F\\), equal magnitudes and opposite directions."
    ],
    [
      "恰滑動：\\(f_s=f_{s,\\max}\\)，剛好到上限。",
      "At the threshold: \\(f_s=f_{s,\\max}\\)."
    ],
    [
      "已滑動：\\(f=f_k\\)，這裡是 19.6 N。",
      "Sliding: \\(f=f_k\\), here 19.6 N."
    ]
  ],
  "videos": {
    "lecture": {
      "time": "17:21",
      "href": "https://youtu.be/IVTzpNB02hI?t=1041"
    },
    "warning": {
      "time": "13:56",
      "href": "https://youtu.be/IVTzpNB02hI?t=836"
    },
    "formula": {
      "time": "19:41",
      "href": "https://youtu.be/IVTzpNB02hI?t=1181"
    }
  },
  "shortBoard": [
    [
      "未滑動：\\(f_s=F\\)，大小相等、方向相反。",
      "At rest: \\(f_s=F\\), equal magnitudes and opposite directions."
    ],
    [
      "恰滑動：\\(f_s=f_{s,\\max}\\)，剛好到上限。",
      "At the threshold: \\(f_s=f_{s,\\max}\\)."
    ],
    [
      "已滑動：\\(f=f_k\\)，這裡是 19.6 N。",
      "Sliding: \\(f=f_k\\), here 19.6 N."
    ]
  ],
  "photo": {
    "kind": "crate",
    "alt": [
      "有袖子的手握繩，水平拉地板上一個裝滿書的木箱，木箱原本靜止而且沒有滑動",
      "A sleeved hand grips a horizontal rope and pulls a book-filled wooden crate on a level floor; the crate starts at rest and does not move"
    ]
  },
  "sections": [
    {
      "title": [
        "引起動機",
        "Get curious"
      ],
      "kind": "photo",
      "steps": [
        {
          "cap": [
            "水平拉裝滿書的木箱，卻[[拉不動]]。",
            "Pull the book-filled crate [[horizontally]]. It will not move."
          ],
          "body": [
            "大木箱原本靜止在水平地板上。你握著繩子，水平向右拉，木箱還是沒動。",
            "A large wooden crate starts at rest on a level floor. You grip a rope and pull horizontally to the right, but it stays still."
          ],
          "source": "課程講稿 3-6；情境自編",
          "videoKeys": []
        },
        {
          "cap": [
            "拉大一點，為什麼仍然[[不動]]？",
            "Pull harder. Why does it [[stay still]]?"
          ],
          "body": [
            "繩子仍然水平，木箱也沒有滑。這支箭頭 F 表示你向右的拉力；還有誰在平衡它？先留著你的直覺。",
            "The rope stays horizontal and the crate does not slip. Arrow F is your rightward pull. What balances it? Keep your first guess."
          ],
          "source": "單元自編",
          "videoKeys": []
        },
        {
          "cap": [
            "是木箱[[比你大力]]嗎？",
            "Is the crate [[stronger than you]]?"
          ],
          "body": [
            "木箱沒有跟你比腕力。先猜猜看，等等讓實驗說話；隨堂題還會遇到同一個木箱。",
            "The crate is not arm-wrestling you. Make a prediction, then let the experiment speak. The same crate returns in the quick checks."
          ],
          "source": "單元自編",
          "videoKeys": []
        }
      ]
    },
    {
      "title": [
        "先預測",
        "Predict first"
      ],
      "kind": "prediction",
      "steps": [
        {
          "cap": [
            "[[先猜]]，這裡不扣分。",
            "[[Make a guess]]. There is no penalty."
          ],
          "body": [
            "條件先給齊：木塊原本靜止在水平桌面，上限是 24.5 N。現在用 10 N 水平向右拉，木塊沒動。先選你現在認為的摩擦力。",
            "Here are all the conditions: the block starts at rest on a level table and its static limit is 24.5 N. A horizontal 10 N pull to the right does not move it. Predict the friction."
          ],
          "source": "課程講稿 0-3",
          "videoKeys": [],
          "question": "p1"
        },
        {
          "cap": [
            "你猜[[摩擦力—拉力圖]]長怎樣？",
            "Predict the [[friction–pull graph]]."
          ],
          "body": [
            "木塊原本靜止在水平桌面。水平向右的拉力從零慢慢加大，滑動後還繼續增加。橫軸是拉力 F，縱軸是摩擦力大小 f。",
            "The block starts at rest on a level table. Increase the rightward horizontal pull from zero and continue after it begins to slide. F is pull magnitude; f is friction magnitude."
          ],
          "source": "單元自編",
          "videoKeys": [],
          "question": "p2"
        },
        {
          "cap": [
            "[[預測先記住]]，接著來看實驗。",
            "[[Keep your predictions]]. Now test them."
          ],
          "body": [
            "這裡只記錄你的選擇，不先說對錯。接下來一次看一個變化，隨時可以上一步重看。",
            "This records your choices without grading them yet. Next, examine one change at a time; you can always step back."
          ],
          "source": "單元自編",
          "videoKeys": []
        }
      ]
    },
    {
      "title": [
        "觀念講解",
        "Build the idea"
      ],
      "kind": "scene",
      "steps": [
        {
          "cap": [
            "換成[[可以量力的小木塊]]，最大讀數會記住拉過的最大力。",
            "Use a [[smaller block to measure forces]]; the peak label remembers the largest pull."
          ],
          "body": [
            "換成 5 kg 小木塊，原本靜置在水平桌面，用水平彈簧量拉力。現在沒有拉力：\\(F=0\\)、\\(f_s=0\\)。彈簧旁的「最大讀數」保留這次拉過的最大力。",
            "Use a 5 kg test block, initially at rest on a level table, with a horizontal spring to measure the pull. With no pull, \\(F=0\\) and \\(f_s=0\\). The peak label beside the spring retains the largest pull so far."
          ],
          "source": "單元自編",
          "videoKeys": [],
          "F": 0
        },
        {
          "cap": [
            "拉 5 N，[[靜摩擦也擋 5 N]]。",
            "Pull with 5 N; [[static friction balances 5 N]]."
          ],
          "body": [
            "水平向右拉 5 N，木塊想向右滑，\\(f_s\\) 就向左。兩力一樣大，水平合力為零，木塊保持靜止。趨勢不等於已經滑動。",
            "Pull horizontally right with 5 N. The block tends to slip right, so \\(f_s\\) acts left. Equal forces give zero horizontal net force and the block stays at rest. A tendency is not actual sliding."
          ],
          "source": "課堂講法",
          "videoKeys": [
            "lecture"
          ],
          "F": 5
        },
        {
          "cap": [
            "拉 15 N，[[兩支箭頭一起長]]。",
            "At 15 N, [[both arrows grow together]]."
          ],
          "body": [
            "拉力變大，靜摩擦力就跟著大。此刻 \\(f_s=15\\) N，方向和拉力相反。兩支箭頭用同一個比例尺，所以一樣長。",
            "As the pull increases, static friction increases with it. Here \\(f_s=15\\) N, opposite to the pull. Both arrows use one scale, so their lengths match."
          ],
          "source": "課堂講法",
          "videoKeys": [
            "lecture"
          ],
          "F": 15
        },
        {
          "cap": [
            "需要多少，就給多少；[[上限還沒到]]。",
            "It supplies what is needed; [[the limit is not reached]]."
          ],
          "body": [
            "特別注意，特別注意，特別注意。靜摩擦力有一個上限 \\(f_{s,\\max}\\)。不是每一次靜止都頂在上限喔。",
            "Pay attention — really, pay attention: static friction has a limit, \\(f_{s,\\max}\\). Being at rest does not mean it is at that limit."
          ],
          "source": "課程講稿 3-7；上限提醒",
          "videoKeys": [
            "warning"
          ],
          "F": 15
        },
        {
          "cap": [
            "24.5 N：[[恰滑動，還沒滑]]。",
            "24.5 N: [[at the threshold, still at rest]]."
          ],
          "body": [
            "它就跟到最大、最大、最大。此刻 \\(f_s=f_{s,\\max}\\)=24.5 N，仍能保持靜止；再多一點，靜摩擦才撐不住。",
            "It follows up to its maximum. Here \\(f_s=f_{s,\\max}\\)=24.5 N and the block can still remain at rest. A slightly greater demand makes it slip."
          ],
          "source": "課堂講法",
          "videoKeys": [
            "lecture"
          ],
          "F": 24.5
        },
        {
          "cap": [
            "跟不住了！[[合力 5.4 N，向右加速]]。",
            "It slips! [[Net force 5.4 N, accelerating right]]."
          ],
          "body": [
            "拉力 25 N 超過上限，木塊開始向右滑。摩擦力改成 \\(f_k=19.6\\) N。合力 \\(25-19.6=5.4\\) N 向右，\\(a=1.08\\ \\mathrm{m/s^2}\\)；木塊真的在加速。",
            "A 25 N pull exceeds the limit and starts the block sliding right. Friction becomes \\(f_k=19.6\\) N. The net force is \\(25-19.6=5.4\\) N rightward, giving \\(a=1.08\\ \\mathrm{m/s^2}\\). The block accelerates."
          ],
          "source": "單元自編",
          "videoKeys": [],
          "F": 25,
          "sliding": true
        },
        {
          "cap": [
            "拉到 40 N，[[\\(a=4.08\\ \\mathrm{m/s^2}\\)]]。",
            "At 40 N, [[\\(a=4.08\\ \\mathrm{m/s^2}\\)]]."
          ],
          "body": [
            "同一接觸面、相同正向力，\\(f_k\\) 仍是 19.6 N，大小不變。合力 \\(40-19.6=20.4\\) N 向右，\\(a=20.4/5=4.08\\ \\mathrm{m/s^2}\\)。",
            "With the same surfaces and normal force, \\(f_k\\) stays at 19.6 N. The net force is \\(40-19.6=20.4\\) N rightward, so \\(a=20.4/5=4.08\\ \\mathrm{m/s^2}\\)."
          ],
          "source": "單元自編；〔40〕授課觀念（速度迷思）",
          "videoKeys": [],
          "F": 40,
          "sliding": true
        },
        {
          "cap": [
            "[[靜止、恰滑動、滑動]]，分清楚。",
            "Tell [[rest, threshold and sliding]] apart."
          ],
          "body": [
            "先看接觸面有沒有滑，再談大小：未滑動用 \\(f_s\\)，恰滑動剛好到 \\(f_{s,\\max}\\)，滑動用 \\(f_k\\)。",
            "Identify the contact state before finding a magnitude: \\(f_s\\) before slipping, \\(f_{s,\\max}\\) at the threshold, and \\(f_k\\) during sliding."
          ],
          "source": "課堂講法；課程講稿 9-3",
          "videoKeys": [
            "lecture"
          ],
          "F": 40,
          "sliding": true,
          "board": true
        }
      ]
    },
    {
      "title": [
        "動手實驗",
        "Try it yourself"
      ],
      "kind": "experiment",
      "steps": [
        {
          "cap": [
            "拖著[[手或彈簧環]]，輕輕水平拉。",
            "Drag the [[hand or spring ring]] gently."
          ],
          "body": [
            "5 kg 木塊原本靜置在水平桌面。用手指水平拖手或彈簧環，彈簧拉長、拉力變大。先輕輕拉，木塊沒有欠你錢。放手拉力歸零；也能拖圖點，或用方向鍵。打開「步驟」跟著做。",
            "The 5 kg block starts at rest on a level table. Drag the hand or ring horizontally: stretching the spring increases the pull. Start gently — the block did nothing to you. Release to remove the pull. You can also drag the graph point or use arrow keys. Open Steps to follow along."
          ],
          "source": "單元自編",
          "videoKeys": []
        }
      ]
    },
    {
      "title": [
        "對答案",
        "Compare your prediction"
      ],
      "kind": "compare",
      "steps": [
        {
          "cap": [
            "[[沒滑]]，不代表沒有摩擦力。",
            "[[No slip]] does not mean no friction."
          ],
          "body": [
            "水平桌面上的木塊原本靜止。用 10 N 水平向右拉仍沒動，表示合力為零，所以 \\(f_s=10\\) N 向左；它不是比較大，也不一定在上限。",
            "The block starts at rest on a level table. A horizontal 10 N pull right does not move it, so the net force is zero and \\(f_s=10\\) N acts left. Friction is neither greater than the pull nor necessarily at its limit."
          ],
          "source": "單元自編",
          "videoKeys": [],
          "question": "p1"
        },
        {
          "cap": [
            "把[[你的預測]]和結果疊起來。",
            "Overlay [[your prediction]] on the result."
          ],
          "body": [
            "選水平線的同學，你很正常，國中那張圖大家常只背形狀。灰帶是你的預測；實線是靜摩擦，虛線是滑動。若還沒有實驗資料，先用標準結果比較。",
            "Picked the flat line? Totally normal — many of us only memorised its shape. The grey band is your prediction; the solid line is static friction and the dashed line is sliding. Without experiment data, compare with the standard result."
          ],
          "source": "課程講稿 0-4 仿寫（新）；單元自編",
          "videoKeys": []
        }
      ]
    },
    {
      "title": [
        "範例",
        "Worked examples"
      ],
      "kind": "examples",
      "steps": [
        {
          "cap": [
            "換到[[斜面]]，同樣先判斷狀態。",
            "Move to an [[incline]]; identify the state first."
          ],
          "body": [
            "這次木板傾斜，先看木塊有沒有滑。只要看到靜摩擦力就代公式，那是不對的。先讀題目、選範例，再一行一行看解答；圖上的力會跟著標出。",
            "The board is now tilted. Check whether the block slips. Substituting a formula merely because friction is static is wrong. Read the problem, choose an example and reveal one solution line at a time; the force diagram follows each line."
          ],
          "source": "課程講稿 8-8；範例解法",
          "videoKeys": [
            "formula"
          ]
        }
      ]
    },
    {
      "title": [
        "隨堂三題",
        "Three quick checks"
      ],
      "kind": "quiz",
      "steps": [
        {
          "cap": [
            "[[拉不動]]，是兩力剛好打平。",
            "[[No motion]] means the forces balance."
          ],
          "body": [
            "還是引起動機那個木箱，原本靜止在水平地板，現在用繩子水平向右拉。先自己選，錯了再選，這裡不扣分。拉不動不是摩擦力贏，是剛好打平。",
            "This is the same crate from the opening, initially at rest on a level floor and pulled right by a horizontal rope. Choose first; try again without penalty. Friction does not win — it balances the pull."
          ],
          "source": "單元自編",
          "videoKeys": [],
          "question": "q1"
        },
        {
          "cap": [
            "已滑動，先看[[動摩擦力]]。",
            "Already sliding: use [[kinetic friction]]."
          ],
          "body": [
            "同一木箱在水平地板上向右滑，接觸條件不變。先分辨靜摩擦和動摩擦，再比較合力；拉力減小，不代表已經在減速。",
            "The same crate slides right on a level floor with unchanged contact conditions. Identify kinetic friction, then compare the forces. A smaller pull does not necessarily mean deceleration."
          ],
          "source": "單元自編",
          "videoKeys": [],
          "question": "q2"
        },
        {
          "cap": [
            "從靜止開始，要比[[靜摩擦上限]]。",
            "From rest, compare with the [[static limit]]."
          ],
          "body": [
            "同一木箱重新靜止在水平地板，用繩子水平向右拉。能不能開始滑，要看靜摩擦上限，不能用滑動時的讀數來判斷。",
            "The same crate is at rest again on the level floor and pulled right by a horizontal rope. Starting to slip depends on the static limit, not the sliding-friction reading."
          ],
          "source": "單元自編",
          "videoKeys": [],
          "question": "q3"
        }
      ]
    },
    {
      "title": [
        "小結",
        "Take it with you"
      ],
      "kind": "summary",
      "steps": [
        {
          "cap": [
            "未滑動：[[需要多少，就給多少]]。",
            "At rest: [[it supplies what is needed]]."
          ],
          "body": [
            "水平拉而沒滑，先用平衡找出需要的 \\(f_s\\)。它是被動調整，不是固定值。",
            "Before slipping under a horizontal pull, use equilibrium to find the needed \\(f_s\\). It adjusts rather than taking a fixed value."
          ],
          "source": "課程講稿 3-7、9-3",
          "videoKeys": []
        },
        {
          "cap": [
            "恰滑動：[[剛好到上限]]。",
            "At the threshold: [[just at the limit]]."
          ],
          "body": [
            "此刻 \\(f_s=f_{s,\\max}\\)，仍是靜摩擦、仍可靜止。再多一點，才開始滑。",
            "At \\(f_s=f_{s,\\max}\\), friction is still static and the block can remain at rest. A slightly greater demand starts sliding."
          ],
          "source": "課堂講法",
          "videoKeys": [
            "lecture"
          ]
        },
        {
          "cap": [
            "已滑動：[[動摩擦力大小不變]]。",
            "Sliding: [[kinetic friction stays constant]]."
          ],
          "body": [
            "接觸面與正向力不變時，\\(f_k\\) 大小不變，方向和相對滑動方向相反。",
            "With unchanged surfaces and normal force, \\(f_k\\) stays constant and opposes relative sliding."
          ],
          "source": "單元自編",
          "videoKeys": []
        },
        {
          "cap": [
            "[[拉多少擋多少]]，擋到上限為止。",
            "[[Pull more, it resists more]] — up to the limit."
          ],
          "body": [
            "靜摩擦力的大小和方向都跟著需要變。上限有多大？下一單元接著看。",
            "Static friction changes in magnitude and direction as needed. How large is the limit? That is next."
          ],
          "source": "課程講稿 3-6、3-7；下單元預告",
          "videoKeys": []
        }
      ]
    }
  ],
  "questions": {
    "p1": {
      "q": [
        "5 kg 木塊靜置在水平桌面，上限為 \\(f_{s,\\max}\\)=24.5 N。用 10 N 水平向右拉仍沒動。摩擦力多大？",
        "A 5 kg block rests on a level table; \\(f_{s,\\max}\\)=24.5 N. A horizontal 10 N pull right does not move it. Find the friction."
      ],
      "correct": 1,
      "options": [
        [
          "0 N",
          "0 N"
        ],
        [
          "10 N",
          "10 N"
        ],
        [
          "24.5 N",
          "24.5 N"
        ],
        [
          "目前不知道",
          "I am not sure yet"
        ]
      ],
      "misconceptions": [
        "M1",
        null,
        "M3",
        "M1/M3"
      ],
      "feedback": [
        [
          "M1｜沒動不代表沒有摩擦力。10 N 拉力需要 10 N 靜摩擦力來平衡。",
          "M1 | Staying still does not mean no friction. A 10 N pull needs 10 N of static friction to balance it."
        ],
        [
          "✓ 沒滑、合力為零，所以 \\(f_s\\) = 10 N；方向和拉力相反。",
          "✓ No slip and zero net force: \\(f_s\\) = 10 N, opposite to the pull."
        ],
        [
          "M3｜24.5 N 是上限，不是隨時的大小。這一刻只需要 10 N。",
          "M3 | 24.5 N is the limit, not the value at every moment. Only 10 N is needed now."
        ],
        [
          "先找合力：木塊沒動，水平合力是零。因此 \\(f_s\\) = 10 N。",
          "Start with the net force: the block stays at rest, so the horizontal net force is zero. Thus \\(f_s\\) = 10 N."
        ]
      ]
    },
    "p2": {
      "q": [
        "木塊原本靜置在水平桌面。水平向右拉力從 0 慢慢加大，滑動後繼續加大。摩擦力—拉力圖是哪張？",
        "The block starts at rest on a level table. Increase the rightward horizontal pull from zero and continue after sliding begins. Which graph fits?"
      ],
      "correct": 2,
      "graph": true,
      "options": [
        [
          "一路水平",
          "Flat throughout"
        ],
        [
          "一路斜上",
          "Rising throughout"
        ],
        [
          "斜上到頂，掉一點，再變平",
          "Rise to a peak, drop, then stay flat"
        ]
      ],
      "misconceptions": [
        "M3",
        "M4",
        null
      ],
      "feedback": [
        [
          "M3｜靜摩擦力不是固定值。未滑動時跟著拉力變，直到上限。",
          "M3 | Static friction is not constant. Before slipping it follows the pull up to its limit."
        ],
        [
          "M4｜已滑動後，摩擦力不再一路跟著長；在這個模型裡維持 19.6 N。",
          "M4 | Once sliding begins, friction stops rising with the pull; here it stays at 19.6 N."
        ],
        [
          "✓ 靜摩擦跟著變到上限；滑動後換成較小的動摩擦力。",
          "✓ Static friction adjusts to its limit; sliding then brings the smaller kinetic friction."
        ]
      ]
    },
    "q1": {
      "q": [
        "同一木箱靜置在水平地板。用繩子水平向右拉 15 N，木箱沒動。地板的摩擦力多大？",
        "The same crate rests on a level floor. A rope pulls horizontally right with 15 N, without moving it. Find the floor friction."
      ],
      "correct": 2,
      "options": [
        [
          "0 N",
          "0 N"
        ],
        [
          "小於 15 N，拉力贏一點點",
          "Less than 15 N; the pull wins slightly"
        ],
        [
          "15 N，方向和拉力相反",
          "15 N, opposite to the pull"
        ],
        [
          "大於 15 N，所以拉不動",
          "More than 15 N; that is why it stays still"
        ]
      ],
      "misconceptions": [
        "M1",
        "M2",
        null,
        "M2"
      ],
      "feedback": [
        [
          "M1｜沒動不是沒摩擦。要平衡 15 N 拉力，就需要 15 N 摩擦力。",
          "M1 | Still does not mean frictionless. Balancing a 15 N pull requires 15 N of friction."
        ],
        [
          "M2｜如果拉力贏一點點，就有合力，木箱會加速。沒動表示兩力平衡。",
          "M2 | If the pull won, a net force would accelerate the crate. Rest means the two horizontal forces balance."
        ],
        [
          "✓ 沒滑、水平合力為零，\\(f_s\\) = 15 N，方向和拉力相反。",
          "✓ No slip and zero horizontal net force: \\(f_s\\) = 15 N, opposite to the pull."
        ],
        [
          "M2｜摩擦力更大也會有合力。木箱沒動，表示摩擦力剛好等於 15 N。",
          "M2 | Larger friction would also give a net force. At rest, friction is exactly 15 N."
        ]
      ]
    },
    "q2": {
      "q": [
        "同一木箱原本靜置在水平地板，現在向右滑。\\(f_{s,\\max}\\)=30 N、\\(f_k\\)=24 N。水平向右的拉力從 35 N 降到 26 N，摩擦力多大？",
        "The same crate, initially at rest on a level floor, now slides right. \\(f_{s,\\max}\\)=30 N and \\(f_k\\)=24 N. Reduce the rightward horizontal pull from 35 N to 26 N. Find the friction."
      ],
      "correct": 1,
      "options": [
        [
          "26 N",
          "26 N"
        ],
        [
          "24 N",
          "24 N"
        ],
        [
          "30 N",
          "30 N"
        ],
        [
          "小於 24 N，越滑越快摩擦越小",
          "Less than 24 N; faster sliding means less friction"
        ]
      ],
      "misconceptions": [
        "M4",
        null,
        "M3",
        "M6"
      ],
      "feedback": [
        [
          "M4｜靜摩擦力跟著拉力變，是還沒滑的平衡情況。現在在滑，\\(f_k\\) = 24 N。",
          "M4 | Static friction follows the pull in equilibrium before slipping. It is sliding now, so \\(f_k\\) = 24 N."
        ],
        [
          "✓ 已經在滑，\\(f_k=24\\) N。合力 \\(26-24=2\\) N 向右，木箱仍在加速。",
          "✓ It is sliding, so \\(f_k=24\\) N. The net force \\(26-24=2\\) N acts right, so the crate is still accelerating."
        ],
        [
          "M3｜30 N 是靜摩擦的上限。已滑動要看動摩擦力，這裡是 24 N。",
          "M3 | 30 N is the static limit. During sliding use the kinetic value: 24 N."
        ],
        [
          "M6｜這個模型的動摩擦力不會因滑得更快就變小。接觸條件相同，仍是 24 N。",
          "M6 | Kinetic friction in this model does not shrink as speed rises. With the same contact conditions it remains 24 N."
        ]
      ]
    },
    "q3": {
      "q": [
        "同一木箱重新靜止在水平地板。\\(f_{s,\\max}\\)=30 N、\\(f_k\\)=24 N。用 25 N 水平向右拉，會怎樣？",
        "The same crate rests again on the level floor. \\(f_{s,\\max}\\)=30 N and \\(f_k\\)=24 N. What happens with a horizontal 25 N pull right?"
      ],
      "correct": 3,
      "options": [
        [
          "會滑，因為 25 N 大於 24 N",
          "It slips because 25 N is greater than 24 N"
        ],
        [
          "不動，\\(f_s\\) = 30 N",
          "It stays at rest; \\(f_s\\) = 30 N"
        ],
        [
          "不動，\\(f_s\\) = 24 N",
          "It stays at rest; \\(f_s\\) = 24 N"
        ],
        [
          "不動，\\(f_s\\) = 25 N",
          "It stays at rest; \\(f_s\\) = 25 N"
        ]
      ],
      "misconceptions": [
        "M5",
        "M3",
        "M3/M5",
        null
      ],
      "feedback": [
        [
          "M5｜會不會開始滑，要和靜摩擦的上限比。25 N 小於 30 N，所以沒滑。",
          "M5 | Starting to slip depends on the static limit. Since 25 N is below 30 N, it stays at rest."
        ],
        [
          "M3｜上限 30 N 不代表現在就是 30 N。平衡 25 N 拉力，只需要 25 N。",
          "M3 | A 30 N limit does not mean friction is 30 N now. Only 25 N is needed to balance the pull."
        ],
        [
          "M3／M5｜24 N 是已滑動的數值。現在沒滑，靜摩擦會調成 25 N。",
          "M3/M5 | 24 N is the sliding value. At rest, static friction adjusts to 25 N."
        ],
        [
          "✓ 25 N 還沒超過 30 N 上限，靜摩擦撐得住；需要多少給多少，\\(f_s\\) = 25 N。",
          "✓ 25 N is below the 30 N static limit, so friction can hold it at rest and supplies the needed 25 N."
        ]
      ]
    }
  },
  "experimentSteps": [
    {
      "t": [
        "輕輕拉到 5 N，木塊不動",
        "Gently reach 5 N without sliding"
      ],
      "detail": [
        "維持 1 秒。先輕輕拉，不要一下拉爆。",
        "Hold for 1 second. Start gently, without a sudden yank."
      ],
      "check": s=>Math.abs(s.F-5)<.5&&!s.moving,
      "hold": 1
    },
    {
      "t": [
        "看摩擦力也是 5 N，朝左",
        "See 5 N of friction acting left"
      ],
      "detail": [
        "看箭頭 2 秒，或按「看到了」。",
        "Watch the arrow for 2 seconds, or press “I see it”."
      ],
      "check": s=>Math.abs(s.F-5)<.5&&s.f>0&&!s.moving,
      "hold": 2,
      "ack": true
    },
    {
      "t": [
        "拉到 15 N，看兩支箭頭一起變長",
        "Reach 15 N; see both arrows grow"
      ],
      "check": s=>Math.abs(s.F-15)<.5&&!s.moving,
      "hold": 0.5
    },
    {
      "t": [
        "慢慢加力直到滑動，記下最大讀數",
        "Increase the pull to slipping; note the peak reading"
      ],
      "detail": [
        "彈簧旁的最大讀數記住本次最大的拉力。剛開始滑時記下它；再繼續拉，最大值也會增加。",
        "The peak label beside the spring retains the largest pull. Note it when slipping starts; pulling harder afterwards increases that peak."
      ],
      "check": s=>s.type==='slip',
      "hold": 0
    },
    {
      "t": [
        "滑動中，把讀數維持在 20 N 左右 1 秒，看它慢慢加速",
        "While sliding, keep the reading near 20 N for 1 s and watch it slowly accelerate"
      ],
      "detail": [
        "用預設桌面，先拉超過上限讓木塊向右滑，再把讀數調到 20 N 左右。讀數恰為 20 N 時，動摩擦力為 19.6 N，合力 \\(20-19.6=0.4\\ \\mathrm{N}\\) 向右。5 kg 木塊的 \\(a=\\frac{0.4}{5}=0.08\\ \\mathrm{m/s^2}\\)，正在加速。要等速，拉力必須剛好是 19.6 N；小於 19.6 N 會減速。從靜止直接拉 20 N，不會讓它自己滑起來。",
        "Use the default table. First pull past the limit to start the block sliding right, then adjust to about 20 N. At exactly 20 N, kinetic friction is 19.6 N, so the net force is \\(20-19.6=0.4\\ \\mathrm{N}\\) to the right. The 5 kg block has \\(a=\\frac{0.4}{5}=0.08\\ \\mathrm{m/s^2}\\): it is accelerating. Constant speed requires exactly 19.6 N; below 19.6 N it slows down. A 20 N pull will not start it sliding from rest."
      ],
      "check": s=>s.moving&&s.F>19.6&&s.F<=20.6&&s.f>0&&s.net<0,
      "hold": 1
    },
    {
      "t": [
        "放手等停下，換邊輕拉，看方向翻轉",
        "Release, wait for rest, then pull gently from the other side"
      ],
      "detail": [
        "在「說明」的實驗設定選「換邊拉」。先等木塊停下，再向左輕拉超過 3 N，看 \\(f_s\\) 向右。",
        "In the settings under Explanation, select “Pull from the other side”. Wait for rest, then pull left above 3 N and observe \\(f_s\\) acting right."
      ],
      "check": s=>s.F< -3&&!s.moving,
      "hold": 0.5
    }
  ],
  "misconceptionLabels": {
    "M1": [
      "沒動＝沒摩擦？",
      "No motion, no friction?"
    ],
    "M2": [
      "拉不動＝摩擦比較大？",
      "Cannot pull it, so friction is bigger?"
    ],
    "M3": [
      "靜摩擦＝固定值？",
      "Static friction is a fixed value?"
    ],
    "M4": [
      "滑了還跟著拉力變？",
      "Still follows the pull while sliding?"
    ],
    "M5": [
      "拿動摩擦判斷會不會滑？",
      "Using kinetic friction to predict slipping?"
    ],
    "M6": [
      "越快摩擦越小？",
      "Faster means less friction?"
    ],
    "M7": [
      "摩擦力方向固定？",
      "Friction always points one way?"
    ]
  },
  "spring": {
    "k": 500,
    "rest": 0.16,
    "turns": 10
  }
};
  if(typeof module!=='undefined'&&module.exports)module.exports=data;else {root.StudyUnit=data;root.Study.mount(data);}
})(typeof window!=='undefined'?window:this);
