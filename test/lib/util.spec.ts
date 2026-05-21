import { describe, it, expect } from 'vitest';
import { escapeHtml, stripHtml, deleteMarkup } from '../../src/lib/util';

describe('escapeHtml', () => {
	it('空字符串返回空字符串', () => {
		expect(escapeHtml('')).toBe('');
	});

	it('不包含特殊字符的文本原样返回', () => {
		expect(escapeHtml('Hello World')).toBe('Hello World');
		expect(escapeHtml('你好世界')).toBe('你好世界');
	});

	it('转义 & 符号', () => {
		expect(escapeHtml('a & b')).toBe('a &amp; b');
	});

	it('转义 < 符号', () => {
		expect(escapeHtml('a < b')).toBe('a &lt; b');
	});

	it('转义 > 符号', () => {
		expect(escapeHtml('a > b')).toBe('a &gt; b');
	});

	it('转义双引号', () => {
		expect(escapeHtml('he said "hello"')).toBe('he said &quot;hello&quot;');
	});

	it('转义单引号', () => {
		expect(escapeHtml("it's a test")).toBe('it&#39;s a test');
	});

	it('转义所有特殊字符混合', () => {
		expect(escapeHtml('<a href="x" title=\'y\'>link & more</a>')).toBe(
			'&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;link &amp; more&lt;/a&gt;',
		);
	});

	it('中文 HTML 片段转义', () => {
		expect(escapeHtml('<b>加粗</b> & <i>斜体</i>')).toBe(
			'&lt;b&gt;加粗&lt;/b&gt; &amp; &lt;i&gt;斜体&lt;/i&gt;',
		);
	});
});

describe('stripHtml', () => {
	it('空字符串返回空字符串', () => {
		expect(stripHtml('')).toBe('');
	});

	it('纯文本原样返回', () => {
		expect(stripHtml('Hello World')).toBe('Hello World');
	});

	it('移除简单 HTML 标签', () => {
		expect(stripHtml('<b>bold</b>')).toBe('bold');
	});

	it('移除嵌套标签', () => {
		expect(stripHtml('<b><i>nested</i></b>')).toBe('nested');
	});

	it('移除 script 标签及其内容', () => {
		expect(stripHtml('<script>alert("xss")</script>safe')).toBe('safe');
	});

	it('移除 style 标签及其内容', () => {
		expect(stripHtml('<style>body{color:red}</style>text')).toBe('text');
	});

	it('解码 HTML 命名实体', () => {
		expect(stripHtml('&lt;tag&gt;')).toBe('<tag>');
	});

	it('解码 HTML 实体组合', () => {
		expect(stripHtml('&lt;b&gt;bold &amp; &quot;cool&quot;&lt;/b&gt;')).toBe(
			'<b>bold & "cool"</b>',
		);
	});

	it('处理不存在的命名实体保留原样', () => {
		expect(stripHtml('&foo; &bar;')).toBe('&foo; &bar;');
	});

	it('self-closing 标签移除', () => {
		expect(stripHtml('line<br>break')).toBe('linebreak');
		expect(stripHtml('img: <img src="x"/> end')).toBe('img:  end');
	});
});

describe('deleteMarkup', () => {
	it('包含 inline_keyboard 数组', () => {
		expect(deleteMarkup).toHaveProperty('inline_keyboard');
		expect(Array.isArray(deleteMarkup.inline_keyboard)).toBe(true);
	});

	it('第一行第一个按钮是删除消息按钮', () => {
		const firstRow = deleteMarkup.inline_keyboard[0];
		expect(firstRow).toBeDefined();
		const firstButton = firstRow[0];
		expect(firstButton.text).toBe('删除消息');
		expect(firstButton.callback_data).toBeDefined();
	});
});
