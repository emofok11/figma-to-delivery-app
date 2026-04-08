import React, { useCallback } from 'react';
import { TextFieldConfig } from '../types/template';
import './TextFieldEditor.css';

interface TextFieldEditorProps {
  field: TextFieldConfig;
  value: string;
  onChange: (value: string) => void;
}

export const TextFieldEditor: React.FC<TextFieldEditorProps> = ({
  field,
  value,
  onChange
}) => {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (field.maxLength && newValue.length > field.maxLength) {
      return;
    }
    onChange(newValue);
  }, [field.maxLength, onChange]);

  // 根据字段类型选择不同的输入组件
  const renderInput = () => {
    const commonProps = {
      id: field.id,
      name: field.id,
      value: value,
      onChange: handleChange,
      placeholder: field.placeholder,
      required: field.required,
      maxLength: field.maxLength,
      className: 'text-field-input',
      style: field.style ? {
        fontSize: field.style.fontSize ? `${field.style.fontSize}px` : undefined,
        fontWeight: field.style.fontWeight,
        color: field.style.color,
        textAlign: field.style.textAlign
      } : undefined
    };

    // 多行文本使用 textarea
    if (field.maxLength && field.maxLength > 100) {
      return (
        <textarea
          {...commonProps}
          rows={4}
          className="text-field-textarea"
        />
      );
    }

    return (
      <input
        {...commonProps}
        type="text"
      />
    );
  };

  return (
    <div className="text-field-editor">
      <div className="text-field-header">
        <label htmlFor={field.id} className="text-field-label">
          {field.label}
          {field.required && <span className="required-mark">*</span>}
        </label>
        {field.maxLength && (
          <span className="char-counter">
            {value.length}/{field.maxLength}
          </span>
        )}
      </div>
      <div className="text-field-body">
        {renderInput()}
      </div>
      {field.placeholder && (
        <div className="text-field-footer">
          <span className="field-hint">{field.placeholder}</span>
        </div>
      )}
    </div>
  );
};

export default TextFieldEditor;