// グローバル変数
let nodes = [];
let links = [];
let selectedNode = null;
let editingNode = null;
let actionHistory = [];
let currentHistoryIndex = -1;
let engine, world, render;
let isFreeFLoating = false;
let isDragging = false;
let draggedNode = null;
let dragOffset = { x: 0, y: 0 };

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initMindMap();
    initPhysicsEngine();
    setupEventListeners();
    createInitialNodes();
});

// マインドマップの初期化
function initMindMap() {
    const container = document.getElementById('mindmap-container');
    const svg = d3.select(container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%');
    
    svg.append('g').attr('class', 'links');
    svg.append('g').attr('class', 'nodes');
}

// 物理エンジンの初期化
function initPhysicsEngine() {
    const container = document.getElementById('mindmap-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Matter.jsのエンジンを作成
    engine = Matter.Engine.create({
        enableSleeping: false,
        constraintIterations: 2
    });
    world = engine.world;
    
    // 重力を無効化
    engine.world.gravity.y = 0;
    
    // 物理エンジンの実行
    Matter.Runner.run(engine);
}

// イベントリスナーの設定
function setupEventListeners() {
    // キーボードイベント
    document.addEventListener('keydown', handleKeyDown);
    
    // ボタンイベント
    document.getElementById('undo-btn').addEventListener('click', undo);
    document.getElementById('redo-btn').addEventListener('click', redo);
    document.getElementById('save-btn').addEventListener('click', saveToJson);
    document.getElementById('load-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', loadFromJson);
    document.getElementById('free-float-btn').addEventListener('click', toggleFreeFloat);
    document.getElementById('apply-btn').addEventListener('click', applyNodeEdit);
    
    // マインドマップコンテナのクリックイベント（ノード選択解除用）
    document.getElementById('mindmap-container').addEventListener('click', handleContainerClick);
    
    // ウィンドウリサイズイベント
    window.addEventListener('resize', updateMindMapSize);
}

// 初期ノードの作成
function createInitialNodes() {
    // 親ノード
    const parentNode = createNode('中心トピック', 'center', null);
    parentNode.x = document.getElementById('mindmap-container').clientWidth / 2;
    parentNode.y = document.getElementById('mindmap-container').clientHeight / 2;
    
    // 子ノード1
    const childNode1 = createNode('サブトピック1', 'child', parentNode.id);
    childNode1.x = parentNode.x - 200;
    childNode1.y = parentNode.y - 100;
    
    // 子ノード2
    const childNode2 = createNode('サブトピック2', 'child', parentNode.id);
    childNode2.x = parentNode.x + 200;
    childNode2.y = parentNode.y - 100;
    
    // ノードを追加
    addNode(parentNode);
    addNode(childNode1);
    addNode(childNode2);
    
    // リンクを作成
    createLink(parentNode.id, childNode1.id);
    createLink(parentNode.id, childNode2.id);
    
    // 描画を更新
    updateMindMap();
    
    // アクション履歴に追加
    addToHistory({
        type: 'init',
        nodes: JSON.parse(JSON.stringify(nodes)),
        links: JSON.parse(JSON.stringify(links))
    });
}

// ノードの作成
function createNode(title, type, parentId) {
    const id = Date.now().toString() + Math.floor(Math.random() * 1000);
    const baseColor = type === 'center' ? '#4a6bdf' : '#6bdf4a';
    
    // 親ノードの色を取得して少し薄くする
    let color = baseColor;
    if (parentId) {
        const parentNode = nodes.find(n => n.id === parentId);
        if (parentNode) {
            // 親の色を少し薄くする
            const parentColor = d3.color(parentNode.color);
            parentColor.opacity = 0.9; // 少し透明にする
            color = parentColor.brighter(0.2).toString();
        }
    }
    
    return {
        id,
        title: title || 'New Node',
        content: '',
        type,
        parentId,
        x: 0,
        y: 0,
        color,
        body: null // Matter.jsの物理ボディ
    };
}

// ノードの追加
function addNode(node) {
    // 物理ボディの作成
    node.body = Matter.Bodies.circle(node.x, node.y, 60, {
        frictionAir: 0.05,
        restitution: 0.7,
        friction: 0.01,
        inertia: Infinity
    });
    
    // ノードIDを物理ボディに関連付け
    node.body.nodeId = node.id;
    
    // 物理ワールドに追加
    Matter.Composite.add(world, node.body);
    
    // ノード配列に追加
    nodes.push(node);
}

// リンクの作成
function createLink(sourceId, targetId) {
    const link = {
        id: `${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        constraint: null
    };
    
    // 物理的な制約を作成
    const sourceNode = nodes.find(n => n.id === sourceId);
    const targetNode = nodes.find(n => n.id === targetId);
    
    if (sourceNode && targetNode) {
        link.constraint = Matter.Constraint.create({
            bodyA: sourceNode.body,
            bodyB: targetNode.body,
            stiffness: 0.02,
            damping: 0.1,
            length: 150
        });
        
        // 物理ワールドに追加
        Matter.Composite.add(world, link.constraint);
        
        // リンク配列に追加
        links.push(link);
    }
    
    return link;
}

// マインドマップの更新
function updateMindMap() {
    const container = document.getElementById('mindmap-container');
    const svg = d3.select('#mindmap-container svg');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // リンクの更新
    const linkElements = svg.select('.links')
        .selectAll('.link')
        .data(links, d => d.id);
    
    linkElements.exit().remove();
    
    const linkEnter = linkElements.enter()
        .append('line')
        .attr('class', 'link');
    
    const linkUpdate = linkEnter.merge(linkElements);
    
    // ノードの更新 - SVGではなくコンテナに直接追加
    // 既存のノード要素を取得
    const nodeElements = d3.select('#mindmap-container')
        .selectAll('.node')
        .data(nodes, d => d.id);
    
    // 不要なノードを削除
    nodeElements.exit().remove();
    
    // 新しいノードを追加
    const nodeEnter = nodeElements.enter()
        .append('div')
        .attr('class', 'node')
        .style('position', 'absolute')
        .style('background-color', d => d.color)
        .on('click', handleNodeClick)
        .on('dblclick', handleNodeDblClick)
        .on('mousedown', handleNodeMouseDown)
        .on('mouseup', handleNodeMouseUp)
        .on('mousemove', handleNodeMouseMove);
    
    // ノードのタイトルを追加
    nodeEnter.append('div')
        .attr('class', 'node-title')
        .text(d => d.title);
    
    // 既存のノードと新しいノードをマージ
    const nodeUpdate = nodeEnter.merge(nodeElements);
    
    // ノードの位置を更新
    nodeUpdate
        .style('left', d => `${d.body.position.x - 60}px`)
        .style('top', d => `${d.body.position.y - 30}px`)
        .classed('selected', d => selectedNode && d.id === selectedNode.id)
        .classed('editing', d => editingNode && d.id === editingNode.id);
    
    // ノードのタイトルを更新
    nodeUpdate.select('.node-title')
        .text(d => d.title);
    
    // リンクの位置を更新
    linkUpdate
        .attr('x1', d => {
            const source = nodes.find(n => n.id === d.source);
            return source ? source.body.position.x : 0;
        })
        .attr('y1', d => {
            const source = nodes.find(n => n.id === d.source);
            return source ? source.body.position.y : 0;
        })
        .attr('x2', d => {
            const target = nodes.find(n => n.id === d.target);
            return target ? target.body.position.x : 0;
        })
        .attr('y2', d => {
            const target = nodes.find(n => n.id === d.target);
            return target ? target.body.position.y : 0;
        });
    
    // 物理エンジンの更新
    nodes.forEach(node => {
        node.x = node.body.position.x;
        node.y = node.body.position.y;
    });
    
    // アニメーションフレームを要求
    requestAnimationFrame(updateMindMap);
}

// ノードクリックハンドラ
function handleNodeClick(event, d) {
    event.stopPropagation();
    
    // 前の選択を解除
    if (selectedNode && selectedNode.id !== d.id) {
        selectedNode = null;
    }
    
    // 選択状態を切り替え
    selectedNode = d;
    
    // 自由泳動が有効な場合は停止
    if (isFreeFLoating) {
        toggleFreeFloat();
    }
    
    // エディタを表示
    showNodeEditor();
    
    // 描画を更新
    updateMindMap();
}

// コンテナクリックハンドラ（ノード選択解除用）
function handleContainerClick(event) {
    // ノード上のクリックでなければ選択を解除
    if (event.target === event.currentTarget || event.target.tagName === 'svg' || event.target.tagName === 'SVG' || event.target.classList.contains('links') || event.target.classList.contains('nodes')) {
        // 選択中のノードがあれば解除
        if (selectedNode) {
            selectedNode = null;
            editingNode = null;
            
            // エディタを非表示
            hideNodeEditor();
            
            // 描画を更新
            updateMindMap();
            
            // 自由泳動が停止していた場合は再開
            if (!isFreeFLoating && document.getElementById('free-float-btn').textContent === '自由泳動') {
                toggleFreeFloat();
            }
        }
    }
}

// ノードダブルクリックハンドラ
function handleNodeDblClick(event, d) {
    event.stopPropagation();
    
    // 編集モードに設定
    editingNode = d;
    selectedNode = d;
    
    // 自由泳動が有効な場合は停止
    if (isFreeFLoating) {
        toggleFreeFloat();
    }
    
    // エディタを表示
    showNodeEditor();
    
    // タイトル入力フィールドにフォーカス
    document.getElementById('node-title').focus();
    
    // 描画を更新
    updateMindMap();
}

// ノードマウスダウンハンドラ
function handleNodeMouseDown(event, d) {
    event.stopPropagation();
    
    if (selectedNode && selectedNode.id === d.id) {
        isDragging = true;
        draggedNode = d;
        
        // ドラッグオフセットを計算
        const rect = event.currentTarget.getBoundingClientRect();
        dragOffset.x = event.clientX - rect.left;
        dragOffset.y = event.clientY - rect.top;
        
        // 物理エンジンの影響を一時的に無効化
        Matter.Body.setStatic(d.body, true);
    }
}

// ノードマウスアップハンドラ
function handleNodeMouseUp(event) {
    if (isDragging && draggedNode) {
        isDragging = false;
        
        // 物理エンジンの影響を再度有効化
        Matter.Body.setStatic(draggedNode.body, false);
        
        // アクション履歴に追加
        addToHistory({
            type: 'move',
            nodeId: draggedNode.id,
            position: {
                x: draggedNode.body.position.x,
                y: draggedNode.body.position.y
            }
        });
        
        draggedNode = null;
    }
}

// ノードマウス移動ハンドラ
function handleNodeMouseMove(event) {
    if (isDragging && draggedNode) {
        const container = document.getElementById('mindmap-container');
        const rect = container.getBoundingClientRect();
        
        // 新しい位置を計算
        const newX = event.clientX - rect.left - dragOffset.x + 60;
        const newY = event.clientY - rect.top - dragOffset.y + 30;
        
        // 物理ボディの位置を更新
        Matter.Body.setPosition(draggedNode.body, {
            x: newX,
            y: newY
        });
        
        // 子ノードも一緒に移動
        const childNodes = nodes.filter(n => n.parentId === draggedNode.id);
        childNodes.forEach(child => {
            const dx = newX - draggedNode.x;
            const dy = newY - draggedNode.y;
            
            Matter.Body.setPosition(child.body, {
                x: child.body.position.x + dx,
                y: child.body.position.y + dy
            });
        });
        
        // ノードの位置を更新
        draggedNode.x = newX;
        draggedNode.y = newY;
    }
}

// キーボードイベントハンドラ
function handleKeyDown(event) {
    if (!selectedNode) return;
    
    if (event.key === 'Tab') {
        event.preventDefault();
        addChildNode();
    } else if (event.key === 'Delete') {
        event.preventDefault();
        deleteNode();
    }
}

// 子ノードの追加
function addChildNode() {
    if (!selectedNode) return;
    
    // 新しい子ノードを作成
    const childNode = createNode('新しいノード', 'child', selectedNode.id);
    
    // 親ノードの近くに配置
    childNode.x = selectedNode.x + Math.random() * 100 - 50;
    childNode.y = selectedNode.y + Math.random() * 100 + 100;
    
    // ノードを追加
    addNode(childNode);
    
    // リンクを作成
    createLink(selectedNode.id, childNode.id);
    
    // アクション履歴に追加
    addToHistory({
        type: 'add',
        node: JSON.parse(JSON.stringify(childNode)),
        link: links[links.length - 1]
    });
    
    // 描画を更新
    updateMindMap();
}

// ノードの削除
function deleteNode() {
    if (!selectedNode) return;
    
    // 削除前の状態を保存
    const nodesToDelete = [selectedNode];
    const linksToDelete = [];
    
    // 子ノードを再帰的に収集
    function collectChildNodes(nodeId) {
        const childNodes = nodes.filter(n => n.parentId === nodeId);
        childNodes.forEach(child => {
            nodesToDelete.push(child);
            collectChildNodes(child.id);
        });
    }
    
    collectChildNodes(selectedNode.id);
    
    // 関連するリンクを収集
    links.forEach(link => {
        if (nodesToDelete.some(n => n.id === link.source || n.id === link.target)) {
            linksToDelete.push(link);
        }
    });
    
    // アクション履歴に追加
    addToHistory({
        type: 'delete',
        nodes: JSON.parse(JSON.stringify(nodesToDelete)),
        links: JSON.parse(JSON.stringify(linksToDelete))
    });
    
    // 物理ワールドから削除
    nodesToDelete.forEach(node => {
        Matter.Composite.remove(world, node.body);
    });
    
    linksToDelete.forEach(link => {
        if (link.constraint) {
            Matter.Composite.remove(world, link.constraint);
        }
    });
    
    // 配列から削除
    nodes = nodes.filter(n => !nodesToDelete.some(d => d.id === n.id));
    links = links.filter(l => !linksToDelete.some(d => d.id === l.id));
    
    // 選択を解除
    selectedNode = null;
    editingNode = null;
    
    // エディタを非表示
    hideNodeEditor();
    
    // 描画を更新
    updateMindMap();
}

// ノードエディタの表示
function showNodeEditor() {
    if (!selectedNode) return;
    
    const editor = document.getElementById('node-editor');
    editor.classList.remove('hidden');
    
    const titleInput = document.getElementById('node-title');
    const contentInput = document.getElementById('node-content');
    
    // 入力フィールドに現在の値をセット
    titleInput.value = selectedNode.title;
    contentInput.value = selectedNode.content;
    
    // タイトル入力フィールドの変更イベントリスナーを設定
    // 既存のイベントリスナーを削除してから追加（重複防止）
    titleInput.removeEventListener('input', updateNodeTitle);
    titleInput.addEventListener('input', updateNodeTitle);
}

// タイトル入力時のリアルタイム更新
function updateNodeTitle(event) {
    if (!selectedNode) return;
    
    // 入力値を取得（最大20文字）
    const newTitle = event.target.value.substring(0, 20);
    
    // ノードのタイトルを更新
    selectedNode.title = newTitle;
    
    // 描画を更新
    updateMindMap();
}

// ノードエディタの非表示
function hideNodeEditor() {
    const editor = document.getElementById('node-editor');
    editor.classList.add('hidden');
}

// ノード編集の適用
function applyNodeEdit() {
    if (!selectedNode) return;
    
    const oldTitle = selectedNode.title;
    const oldContent = selectedNode.content;
    
    // 新しい値を取得
    const newTitle = document.getElementById('node-title').value.substring(0, 20);
    const newContent = document.getElementById('node-content').value;
    
    // 値が変更された場合のみ履歴に追加
    if (oldTitle !== newTitle || oldContent !== newContent) {
        // アクション履歴に追加
        addToHistory({
            type: 'edit',
            nodeId: selectedNode.id,
            oldValues: {
                title: oldTitle,
                content: oldContent
            },
            newValues: {
                title: newTitle,
                content: newContent
            }
        });
        
        // 値を更新
        selectedNode.title = newTitle;
        selectedNode.content = newContent;
        
        // 描画を更新
        updateMindMap();
    }
    
    // 編集モードを解除
    editingNode = null;
}

// アクション履歴に追加
function addToHistory(action) {
    // 現在の履歴インデックス以降の履歴を削除
    if (currentHistoryIndex < actionHistory.length - 1) {
        actionHistory = actionHistory.slice(0, currentHistoryIndex + 1);
    }
    
    // 履歴が10個を超える場合、最も古い履歴を削除
    if (actionHistory.length >= 10) {
        actionHistory.shift();
    } else {
        currentHistoryIndex++;
    }
    
    // 新しいアクションを追加
    actionHistory.push(action);
    
    // ボタンの状態を更新
    updateHistoryButtons();
}

// 履歴ボタンの状態を更新
function updateHistoryButtons() {
    document.getElementById('undo-btn').disabled = currentHistoryIndex < 0;
    document.getElementById('redo-btn').disabled = currentHistoryIndex >= actionHistory.length - 1;
}

// 元に戻す
function undo() {
    if (currentHistoryIndex < 0) return;
    
    const action = actionHistory[currentHistoryIndex];
    
    switch (action.type) {
        case 'add':
            // ノードとリンクを削除
            const nodeToRemove = nodes.find(n => n.id === action.node.id);
            const linkToRemove = links.find(l => l.id === action.link.id);
            
            if (nodeToRemove) {
                Matter.Composite.remove(world, nodeToRemove.body);
                nodes = nodes.filter(n => n.id !== nodeToRemove.id);
            }
            
            if (linkToRemove && linkToRemove.constraint) {
                Matter.Composite.remove(world, linkToRemove.constraint);
                links = links.filter(l => l.id !== linkToRemove.id);
            }
            break;
            
        case 'delete':
            // ノードとリンクを復元
            action.nodes.forEach(node => {
                const restoredNode = createNode(node.title, node.type, node.parentId);
                restoredNode.id = node.id;
                restoredNode.x = node.x;
                restoredNode.y = node.y;
                restoredNode.color = node.color;
                restoredNode.content = node.content;
                
                addNode(restoredNode);
            });
            
            action.links.forEach(link => {
                createLink(link.source, link.target);
            });
            break;
            
        case 'edit':
            // ノードの内容を元に戻す
            const nodeToEdit = nodes.find(n => n.id === action.nodeId);
            if (nodeToEdit) {
                nodeToEdit.title = action.oldValues.title;
                nodeToEdit.content = action.oldValues.content;
            }
            break;
            
        case 'move':
            // ノードの位置を元に戻す
            const nodeToMove = nodes.find(n => n.id === action.nodeId);
            if (nodeToMove && nodeToMove.body) {
                // 前の位置情報がない場合は何もしない
                if (action.oldPosition) {
                    Matter.Body.setPosition(nodeToMove.body, action.oldPosition);
                    nodeToMove.x = action.oldPosition.x;
                    nodeToMove.y = action.oldPosition.y;
                }
            }
            break;
            
        case 'init':
            // 初期状態に戻す（全て削除して再作成）
            nodes.forEach(node => {
                Matter.Composite.remove(world, node.body);
            });
            
            links.forEach(link => {
                if (link.constraint) {
                    Matter.Composite.remove(world, link.constraint);
                }
            });
            
            nodes = [];
            links = [];
            
            // 前の状態を復元
            if (currentHistoryIndex > 0) {
                const prevState = actionHistory[currentHistoryIndex - 1];
                if (prevState.type === 'init') {
                    prevState.nodes.forEach(node => {
                        const restoredNode = createNode(node.title, node.type, node.parentId);
                        restoredNode.id = node.id;
                        restoredNode.x = node.x;
                        restoredNode.y = node.y;
                        restoredNode.color = node.color;
                        restoredNode.content = node.content;
                        
                        addNode(restoredNode);
                    });
                    
                    prevState.links.forEach(link => {
                        createLink(link.source, link.target);
                    });
                }
            }
            break;
    }
    
    // 履歴インデックスを減らす
    currentHistoryIndex--;
    
    // 選択を解除
    selectedNode = null;
    editingNode = null;
    
    // エディタを非表示
    hideNodeEditor();
    
    // ボタンの状態を更新
    updateHistoryButtons();
    
    // 描画を更新
    updateMindMap();
}

// やり直し
function redo() {
    if (currentHistoryIndex >= actionHistory.length - 1) return;
    
    // 履歴インデックスを増やす
    currentHistoryIndex++;
    
    const action = actionHistory[currentHistoryIndex];
    
    switch (action.type) {
        case 'add':
            // ノードとリンクを追加
            const childNode = createNode(action.node.title, action.node.type, action.node.parentId);
            childNode.id = action.node.id;
            childNode.x = action.node.x;
            childNode.y = action.node.y;
            childNode.color = action.node.color;
            childNode.content = action.node.content;
            
            addNode(childNode);
            createLink(action.node.parentId, childNode.id);
            break;
            
        case 'delete':
            // ノードとリンクを削除
            action.nodes.forEach(node => {
                const nodeToRemove = nodes.find(n => n.id === node.id);
                if (nodeToRemove) {
                    Matter.Composite.remove(world, nodeToRemove.body);
                    nodes = nodes.filter(n => n.id !== nodeToRemove.id);
                }
            });
            
            action.links.forEach(link => {
                const linkToRemove = links.find(l => l.id === link.id);
                if (linkToRemove && linkToRemove.constraint) {
                    Matter.Composite.remove(world, linkToRemove.constraint);
                    links = links.filter(l => l.id !== linkToRemove.id);
                }
            });
            break;
            
        case 'edit':
            // ノードの内容を更新
            const nodeToEdit = nodes.find(n => n.id === action.nodeId);
            if (nodeToEdit) {
                nodeToEdit.title = action.newValues.title;
                nodeToEdit.content = action.newValues.content;
            }
            break;
            
        case 'move':
            // ノードの位置を更新
            const nodeToMove = nodes.find(n => n.id === action.nodeId);
            if (nodeToMove && nodeToMove.body) {
                Matter.Body.setPosition(nodeToMove.body, action.position);
                nodeToMove.x = action.position.x;
                nodeToMove.y = action.position.y;
            }
            break;
            
        case 'init':
            // 初期状態に戻す
            nodes.forEach(node => {
                Matter.Composite.remove(world, node.body);
            });
            
            links.forEach(link => {
                if (link.constraint) {
                    Matter.Composite.remove(world, link.constraint);
                }
            });
            
            nodes = [];
            links = [];
            
            // 新しい状態を適用
            action.nodes.forEach(node => {
                const restoredNode = createNode(node.title, node.type, node.parentId);
                restoredNode.id = node.id;
                restoredNode.x = node.x;
                restoredNode.y = node.y;
                restoredNode.color = node.color;
                restoredNode.content = node.content;
                
                addNode(restoredNode);
            });
            
            action.links.forEach(link => {
                createLink(link.source, link.target);
            });
            break;
    }
    
    // 選択を解除
    selectedNode = null;
    editingNode = null;
    
    // エディタを非表示
    hideNodeEditor();
    
    // ボタンの状態を更新
    updateHistoryButtons();
    
    // 描画を更新
    updateMindMap();
}

// JSONとして保存
function saveToJson() {
    // ノードとリンクのデータを準備
    const data = {
        nodes: nodes.map(node => ({
            id: node.id,
            title: node.title,
            content: node.content,
            type: node.type,
            parentId: node.parentId,
            x: node.x,
            y: node.y,
            color: node.color
        })),
        links: links.map(link => ({
            id: link.id,
            source: link.source,
            target: link.target
        }))
    };
    
    // JSONに変換
    const jsonString = JSON.stringify(data, null, 2);
    
    // ダウンロードリンクを作成
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// JSONから読み込み
function loadFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // 現在の状態を保存
            const oldNodes = JSON.parse(JSON.stringify(nodes));
            const oldLinks = JSON.parse(JSON.stringify(links));
            
            // 全てのノードとリンクを削除
            nodes.forEach(node => {
                Matter.Composite.remove(world, node.body);
            });
            
            links.forEach(link => {
                if (link.constraint) {
                    Matter.Composite.remove(world, link.constraint);
                }
            });
            
            nodes = [];
            links = [];
            
            // 新しいノードを作成
            data.nodes.forEach(nodeData => {
                const node = createNode(nodeData.title, nodeData.type, nodeData.parentId);
                node.id = nodeData.id;
                node.x = nodeData.x;
                node.y = nodeData.y;
                node.color = nodeData.color;
                node.content = nodeData.content;
                
                addNode(node);
            });
            
            // 新しいリンクを作成
            data.links.forEach(linkData => {
                createLink(linkData.source, linkData.target);
            });
            
            // アクション履歴に追加
            addToHistory({
                type: 'init',
                nodes: JSON.parse(JSON.stringify(data.nodes)),
                links: JSON.parse(JSON.stringify(data.links)),
                oldNodes,
                oldLinks
            });
            
            // 選択を解除
            selectedNode = null;
            editingNode = null;
            
            // エディタを非表示
            hideNodeEditor();
            
            // 描画を更新
            updateMindMap();
            
        } catch (error) {
            console.error('JSONの解析に失敗しました:', error);
            alert('ファイルの読み込みに失敗しました。有効なJSONファイルを選択してください。');
        }
    };
    
    reader.readAsText(file);
    
    // ファイル入力をリセット
    event.target.value = '';
}

// 自由泳動モードの切り替え
function toggleFreeFloat() {
    isFreeFLoating = !isFreeFLoating;
    
    if (isFreeFLoating) {
        // 自由泳動モードを有効化
        document.getElementById('free-float-btn').textContent = '自由泳動停止';
        
        // 選択中のノードがあれば選択を解除
        if (selectedNode) {
            selectedNode = null;
            editingNode = null;
            
            // エディタを非表示
            hideNodeEditor();
            
            // 描画を更新
            updateMindMap();
        }
        
        // ランダムな力を加える間隔を設定
        freeFloatInterval = setInterval(() => {
            nodes.forEach(node => {
                // ランダムな力を加える
                const force = {
                    x: (Math.random() - 0.5) * 0.5,
                    y: (Math.random() - 0.5) * 0.5
                };
                
                Matter.Body.applyForce(node.body, node.body.position, force);
            });
        }, 1000);
    } else {
        // 自由泳動モードを無効化
        document.getElementById('free-float-btn').textContent = '自由泳動';
        
        // 間隔をクリア
        clearInterval(freeFloatInterval);
        
        // 全てのノードの速度を減衰
        nodes.forEach(node => {
            Matter.Body.setVelocity(node.body, {
                x: node.body.velocity.x * 0.5,
                y: node.body.velocity.y * 0.5
            });
        });
    }
}

// ウィンドウサイズ変更時の処理
function updateMindMapSize() {
    const svg = d3.select('#mindmap-container svg');
    const container = document.getElementById('mindmap-container');
    
    svg.attr('width', container.clientWidth)
       .attr('height', container.clientHeight);
}
